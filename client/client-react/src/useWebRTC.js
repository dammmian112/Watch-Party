import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';

const SOCKET_URL = 'https://watch-party-trzz.onrender.com';

export default function useWebRTC() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const userName = searchParams.get('user') || '';
  const [users, setUsers] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // { peerId: MediaStream }
  const [socket, setSocket] = useState(null);
  const peerConnections = useRef({});
  const socketRef = useRef();

  // Socket.IO init
  useEffect(() => {
    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: false
    });
    setSocket(s);
    socketRef.current = s;
    s.emit('join-room', { roomId, userName });

    s.on('users-update', (users) => setUsers(users));
    s.on('user-left', (userId) => closePeerConnection(userId));

    return () => {
      s.disconnect();
      Object.keys(peerConnections.current).forEach(userId => closePeerConnection(userId));
    };
    // eslint-disable-next-line
  }, [roomId, userName]);

  // Pobieranie streamu
  useEffect(() => {
    console.log('useEffect [cameraOn, micOn]:', { cameraOn, micOn });
    if (cameraOn || micOn) {
      const constraints = {
        video: cameraOn,
        audio: micOn
      };
      console.log('getUserMedia constraints:', constraints);
      navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        console.log('getUserMedia success, tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
        setLocalStream(stream);
      }).catch((error) => {
        console.error('getUserMedia error:', error);
        setCameraOn(false);
        setMicOn(false);
        setLocalStream(null);
      });
    } else {
      if (localStream) {
        console.log('Stopping localStream tracks');
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
    }
    // eslint-disable-next-line
  }, [cameraOn, micOn]);

  // Cleanup streamów po wyjściu
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
      setPeers({});
    };
  }, [localStream]);

  // Tworzenie peer connection
  const createPeerConnection = (userId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });

    // Odbiór streamu od peerów
    pc.ontrack = (event) => {
      setPeers(prev => ({ ...prev, [userId]: event.streams[0] }));
    };

    // ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket && socket.emit('ice-candidate', {
          roomId,
          to: userId,
          candidate: event.candidate
        });
      }
    };

    // Usuwanie peerów po rozłączeniu
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        closePeerConnection(userId);
      }
    };

    // Dodaj oba tracki (audio, video) nawet jeśli są wyłączone
    let audioTrack = null;
    let videoTrack = null;
    if (localStream) {
      audioTrack = localStream.getAudioTracks()[0] || null;
      videoTrack = localStream.getVideoTracks()[0] || null;
    }
    // Jeśli nie ma tracka, twórz pusty (muted) track
    if (!audioTrack) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const dst = oscillator.connect(ctx.createMediaStreamDestination());
        audioTrack = dst.stream.getAudioTracks()[0];
        audioTrack.enabled = false;
      } catch (e) { audioTrack = null; }
    }
    if (!videoTrack) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        const stream = canvas.captureStream();
        videoTrack = stream.getVideoTracks()[0];
        videoTrack.enabled = false;
      } catch (e) { videoTrack = null; }
    }
    if (audioTrack) pc.addTrack(audioTrack, localStream || new MediaStream([audioTrack]));
    if (videoTrack) pc.addTrack(videoTrack, localStream || new MediaStream([videoTrack]));

    peerConnections.current[userId] = pc;
    return pc;
  };

  const closePeerConnection = (userId) => {
    const pc = peerConnections.current[userId];
    if (pc) {
      pc.close();
      delete peerConnections.current[userId];
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
    }
  };

  // Obsługa signalingu
  useEffect(() => {
    if (!socket) return;

    socket.on('offer', async ({ from, offer }) => {
      console.log('Received offer from:', from);
      let pc = peerConnections.current[from];
      if (!pc) pc = createPeerConnection(from);
      await pc.setRemoteDescription(new window.RTCSessionDescription(offer));
      // Dodaj/replace tracki jeśli localStream się zmienił
      if (localStream) {
        const senders = pc.getSenders();
        localStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track && s.track.kind === track.kind);
          if (sender) sender.replaceTrack(track);
          else pc.addTrack(track, localStream);
        });
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socket) socket.emit('answer', { roomId, to: from, answer });
    });

    socket.on('answer', async ({ from, answer }) => {
      console.log('Received answer from:', from);
      const pc = peerConnections.current[from];
      if (pc) {
        await pc.setRemoteDescription(new window.RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
      console.log('Received ICE candidate from:', from);
      const pc = peerConnections.current[from];
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
      }
    });

    socket.on('user-left', (userId) => {
      closePeerConnection(userId);
    });

    return () => {
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('user-left');
    };
  }, [socket, localStream]);

  // Nowy użytkownik łączy się do wszystkich obecnych
  useEffect(() => {
    const myId = socket?.id;
    if (!myId || !socket || !localStream) return;
    // Tylko jeśli jestem nowy (ostatni w users)
    const myIndex = users.findIndex(u => u.id === myId);
    if (myIndex === users.length - 1) {
      users.forEach(user => {
        if (user.id !== myId && !peerConnections.current[user.id]) {
          const pc = createPeerConnection(user.id);
          pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit('offer', { roomId, to: user.id, offer });
          });
        }
      });
    }
  }, [users, socket, localStream]);

  // Po zmianie localStream tylko replaceTrack, NIE twórz nowego offer
  useEffect(() => {
    console.log('useEffect [localStream]:', { 
      hasLocalStream: !!localStream, 
      tracks: localStream ? localStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })) : []
    });
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      const senders = pc.getSenders();
      console.log('Peer', peerId, 'senders:', senders.map(s => ({ kind: s.track?.kind, hasTrack: !!s.track })));
      
      // Audio
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      const newAudioTrack = localStream ? localStream.getAudioTracks()[0] : null;
      if (audioSender) {
        audioSender.replaceTrack(newAudioTrack);
        console.log('replaceTrack audio', peerId, !!newAudioTrack, 'enabled:', newAudioTrack?.enabled);
      }
      // Video
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      const newVideoTrack = localStream ? localStream.getVideoTracks()[0] : null;
      if (videoSender) {
        videoSender.replaceTrack(newVideoTrack);
        console.log('replaceTrack video', peerId, !!newVideoTrack, 'enabled:', newVideoTrack?.enabled);
      }
    });
  }, [localStream]);

  return {
    localStream,
    peers,
    cameraOn,
    micOn,
    setCameraOn,
    setMicOn,
    users,
    setUsers,
    socket,
    userName,
    roomId
  };
} 