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
    if (cameraOn || micOn) {
      navigator.mediaDevices.getUserMedia({
        video: cameraOn,
        audio: micOn
      }).then(stream => {
        setLocalStream(stream);
      }).catch(() => {
        setCameraOn(false);
        setMicOn(false);
        setLocalStream(null);
      });
    } else {
      if (localStream) {
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
        socketRef.current.emit('ice-candidate', {
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

    // Dodaj lokalne tracki
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

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

  // Po zmianie localStream aktualizuj tracki u peerów
  useEffect(() => {
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      const senders = pc.getSenders();
      if (localStream) {
        localStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track && s.track.kind === track.kind);
          if (sender) sender.replaceTrack(track);
          else pc.addTrack(track, localStream);
        });
      } else {
        // Wyłącz wszystkie tracki
        senders.forEach(sender => {
          if (sender.track) sender.replaceTrack(null);
        });
      }
      // Renegocjacja
      if (pc.signalingState === 'stable') {
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          if (socket) socket.emit('offer', { roomId, to: peerId, offer });
        });
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