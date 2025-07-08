import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Grid, TextField, Button, Avatar, Fade, AppBar, Toolbar, Divider, Tooltip } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import TheatersIcon from '@mui/icons-material/Theaters';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const SOCKET_URL = 'https://watch-party-trzz.onrender.com';

// Dodaję styl globalny dla Bitcount Grid Double
const bitcountFont = {
  fontFamily: '"Bitcount Grid Double", system-ui',
  fontOpticalSizing: 'auto',
  fontVariationSettings: '"slnt" 0, "CRSV" 0.5, "ELSH" 0, "ELXP" 0',
};

// Komponent do poprawnego przypisywania srcObject do <video>
function PeerVideo({ stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream instanceof MediaStream) {
      videoRef.current.srcObject = stream;
      console.log('PeerVideo srcObject set', stream);
    }
  }, [stream]);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}

export default function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const userName = searchParams.get('user') || '';
  const [dmUrl, setDmUrl] = useState('');
  const [dmInput, setDmInput] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cameraMode, setCameraMode] = useState('fixed'); // 'fixed' or 'floating'
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [copied, setCopied] = useState(false);
  const playerRef = useRef();
  const videoRef = useRef();
  const [camPos, setCamPos] = useState({ x: 20, y: 100 });
  const [camSize, setCamSize] = useState({ w: 240, h: 180 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [camHover, setCamHover] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const navigate = useNavigate();
  const [cinemaHeight, setCinemaHeight] = useState(0);
  // Stan playera do synchronizacji
  const [playerReady, setPlayerReady] = useState(false);
  const [playerState, setPlayerState] = useState({ playing: false, time: 0 });
  const [dmPlayer, setDmPlayer] = useState(null);
  const [videoId, setVideoId] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [lastSeekTime, setLastSeekTime] = useState(0);
  const [manualTime, setManualTime] = useState('');

  // WebRTC states
  const [peers, setPeers] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [users, setUsers] = useState([]);
  const peerConnections = useRef({});
  // Dodaję referencję do socket, aby zawsze mieć aktualny obiekt
  const socketRef = useRef(null);
  // Dodaję strukturę do przechowywania kolejki ICE candidates
  const pendingCandidates = useRef({});

  // Socket.IO init
  useEffect(() => {
    // Loguj informacje o URL
    console.log('Current URL:', window.location.href);
    console.log('Protocol:', window.location.protocol);
    console.log('Hostname:', window.location.hostname);
    console.log('MediaDevices available:', !!navigator.mediaDevices);
    console.log('getUserMedia available:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));

    const s = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: false
    });
    setSocket(s);
    socketRef.current = s;
    s.emit('join-room', { roomId, userName });

    // Powiadomienie o nowym użytkowniku
    s.on('user-joined', (userId) => {
      setMessages((msgs) => [...msgs, { type: 'system', message: `Nowy użytkownik dołączył do pokoju.` }]);
    });

    // Aktualizacja listy użytkowników i powiadomienia o wejściu/wyjściu
    s.on('users-update', (users, leavingUserName) => {
      setUsers(users);
      setMessages((prev) => {
        let sysMsgs = [];
        // Nowi użytkownicy
        const prevIds = prev.filter(m => m.type === 'system-user').map(m => m.userId);
        const currentIds = users.map(u => u.id);
        const joined = users.filter(u => !prevIds.includes(u.id));
        joined.forEach(u => {
          if (u.userName !== userName) sysMsgs.push({ type: 'system', message: `${u.userName} dołączył(a) do pokoju.` });
        });
        // Opuszczenie pokoju
        if (leavingUserName && leavingUserName !== userName) {
          sysMsgs.push({ type: 'system', message: `${leavingUserName} opuścił(a) pokój.` });
        }
        return [...prev, ...sysMsgs];
      });
    });

    // Poprawiona obsługa wiadomości czatu
    s.on('chat-message', ({ userName, message }) => {
      setMessages((msgs) => [...msgs, { type: 'chat', userName, message }]);
    });

    // WebRTC signaling (pozostawiam jak było)
    s.on('user-left', (userId) => {
      console.log('User left:', userId);
      closePeerConnection(userId);
    });
    s.on('offer', async ({ from, offer }) => {
      console.log('Received offer from:', from);
      if (!peerConnections.current[from]) {
        await handleOffer(from, offer);
      }
    });
    s.on('answer', async ({ from, answer }) => {
      console.log('Received answer from:', from);
      await handleAnswer(from, answer);
    });
    s.on('ice-candidate', async ({ from, candidate }) => {
      console.log('Received ICE candidate from:', from);
      await handleIceCandidate(from, candidate);
    });

    return () => {
      s.disconnect();
      Object.keys(peerConnections.current).forEach(userId => {
        closePeerConnection(userId);
      });
    };
  }, [roomId, userName]);

  // WebRTC functions
  const createPeerConnection = async (userId) => {
    try {
      const socketInstance = socketRef.current;
      if (peerConnections.current[userId]) {
        closePeerConnection(userId);
      }
      console.log('createPeerConnection called for', userId, 'myId:', socketInstance?.id);
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

      // Add local stream tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketInstance) {
          socketInstance.emit('ice-candidate', { roomId, to: userId, candidate: event.candidate });
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('ontrack fired for', userId, event.streams, event.track);
        setPeers(prev => ({
          ...prev,
          [userId]: event.streams[0]
        }));
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Connection state for', userId, ':', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          closePeerConnection(userId);
        }
      };

      peerConnections.current[userId] = pc;

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (socketInstance) {
        socketInstance.emit('offer', { roomId, to: userId, offer });
      }

      // Timeout dla połączenia
      setTimeout(() => {
        if (pc.connectionState !== 'connected' && peerConnections.current[userId]) {
          console.log('WebRTC connection timeout for:', userId);
          closePeerConnection(userId);
        }
      }, 10000); // 10 sekund timeout

    } catch (error) {
      console.error('Error creating peer connection:', error);
    }
  };

  const handleOffer = async (from, offer) => {
    try {
      const socketInstance = socketRef.current;
      let pc = peerConnections.current[from];
      if (!pc) {
        pc = new RTCPeerConnection({
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
        // Dodaj lokalne tracki jeśli są
        if (localStream) {
          localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
          });
        }
        pc.onicecandidate = (event) => {
          if (event.candidate && socketInstance) {
            socketInstance.emit('ice-candidate', { roomId, to: from, candidate: event.candidate });
          }
        };
        pc.ontrack = (event) => {
          console.log('ontrack fired for', from, event.streams, event.track);
          setPeers(prev => ({
            ...prev,
            [from]: event.streams[0]
          }));
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            closePeerConnection(from);
          }
        };
        peerConnections.current[from] = pc;
      }
      await pc.setRemoteDescription(offer);
      // Dodaj zakolejkowane candidates
      if (pendingCandidates.current[from]) {
        for (const c of pendingCandidates.current[from]) {
          try {
            await pc.addIceCandidate(c);
          } catch (err) {
            console.error('Error adding ICE candidate from queue:', err, c);
          }
        }
        pendingCandidates.current[from] = [];
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socketInstance) {
        socketInstance.emit('answer', { roomId, to: from, answer });
      }
      console.log('Sent answer to', from);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (from, answer) => {
    try {
      const pc = peerConnections.current[from];
      if (pc && pc.signalingState !== 'closed') {
        await pc.setRemoteDescription(answer);
        // Dodaj zakolejkowane candidates
        if (pendingCandidates.current[from]) {
          for (const c of pendingCandidates.current[from]) {
            try {
              await pc.addIceCandidate(c);
            } catch (err) {
              console.error('Error adding ICE candidate from queue:', err, c);
            }
          }
          pendingCandidates.current[from] = [];
        }
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (from, candidate) => {
    try {
      const pc = peerConnections.current[from];
      if (pc && pc.signalingState !== 'closed') {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error('Error adding ICE candidate:', err, candidate);
          }
        } else {
          // Kolejkuj candidate
          if (!pendingCandidates.current[from]) pendingCandidates.current[from] = [];
          pendingCandidates.current[from].push(candidate);
        }
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const closePeerConnection = (userId) => {
    const pc = peerConnections.current[userId];
    if (pc) {
      pc.close();
      delete peerConnections.current[userId];
    }
    setPeers(prev => {
      const newPeers = { ...prev };
      delete newPeers[userId];
      return newPeers;
    });
  };

  // Włączanie/wyłączanie kamery
  useEffect(() => {
    if (cameraOn || micOn) {
      // Sprawdź czy mediaDevices jest dostępne
      if (!navigator.mediaDevices) {
        console.error('MediaDevices API nie jest dostępne w tej przeglądarce');
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: 'MediaDevices API nie jest dostępne. Sprawdź czy używasz HTTPS lub localhost.' 
        }]);
        setCameraOn(false);
        setMicOn(false);
        return;
      }

      if (!navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia nie jest dostępne w tej przeglądarce');
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: 'getUserMedia nie jest dostępne. Sprawdź uprawnienia przeglądarki.' 
        }]);
        setCameraOn(false);
        setMicOn(false);
        return;
      }

      // Sprawdź czy jesteśmy na HTTPS lub localhost
      const isSecure = window.location.protocol === 'https:' || 
                      window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.startsWith('192.168.') ||
                      window.location.hostname.startsWith('10.') ||
                      window.location.hostname.startsWith('172.');
      
      if (!isSecure) {
        console.warn('MediaDevices może wymagać HTTPS lub lokalnej sieci');
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: 'Kamera/mikrofon może wymagać HTTPS lub lokalnej sieci.' 
        }]);
      }

      const constraints = {
        video: cameraOn ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false,
        audio: micOn ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false
      };

      console.log('Requesting media with constraints:', constraints);

      navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        console.log('Media stream obtained successfully');
        setLocalStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        // Poprawiona logika WebRTC - po włączeniu kamerki twórz peer connection dla wszystkich użytkowników
        users.forEach(user => {
          if (user.id !== socket?.id && !peerConnections.current[user.id]) {
            createPeerConnection(user.id);
          }
        });
      })
      .catch(err => {
        console.error('Błąd dostępu do kamery/mikrofonu:', err);
        
        let errorMessage = 'Błąd dostępu do kamery/mikrofonu: ';
        
        if (err.name === 'NotAllowedError') {
          errorMessage += 'Odmowa dostępu. Sprawdź uprawnienia przeglądarki.';
        } else if (err.name === 'NotFoundError') {
          errorMessage += 'Nie znaleziono kamery/mikrofonu.';
        } else if (err.name === 'NotReadableError') {
          errorMessage += 'Kamera/mikrofon jest używany przez inną aplikację.';
        } else if (err.name === 'OverconstrainedError') {
          errorMessage += 'Kamera nie obsługuje wymaganych ustawień.';
        } else if (err.name === 'TypeError') {
          errorMessage += 'Nieprawidłowe parametry.';
        } else {
          errorMessage += err.message;
        }
        
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: errorMessage 
        }]);
        setCameraOn(false);
        setMicOn(false);
      });
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      // Close all peer connections
      Object.keys(peerConnections.current).forEach(userId => {
        closePeerConnection(userId);
      });
    }
  }, [cameraOn, micOn, users, socket]);

  // Wysyłanie wiadomości
  const sendMessage = () => {
    if (message.trim() && socket) {
      socket.emit('chat-message', { roomId, userName, message });
      setMessage('');
    }
  };

  // Synchronizacja linku do filmu Dailymotion
  useEffect(() => {
    if (!socket) return;
    socket.on('dm-url', (url) => {
      setDmUrl(url);
      setDmInput(url);
      // Wyciągnij video ID z URL
      const match = url.match(/\/video\/([a-zA-Z0-9]+)/);
      if (match) {
        setVideoId(match[1]);
      }
    });
    // Po wejściu do pokoju pobierz aktualny link
    socket.emit('get-dm-url', { roomId });
    return () => socket.off('dm-url');
  }, [socket, roomId]);

  // Obsługa Dailymotion
  const handleSetDm = () => {
    if (dmInput && socket) {
      setDmUrl(dmInput);
      setDmInput(dmInput);
      socket.emit('set-dm-url', { roomId, dmUrl: dmInput });
      // Wyciągnij video ID z URL
      const match = dmInput.match(/\/video\/([a-zA-Z0-9]+)/);
      if (match) {
        setVideoId(match[1]);
      }
    }
  };

  // Kopiowanie ID pokoju
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Inicjalizacja Dailymotion Player API
  useEffect(() => {
    if (!videoId || !playerRef.current) return;

    // Wyczyść poprzedni player
    if (dmPlayer) {
      setDmPlayer(null);
    }

    // Użyj prostego embed URL
    const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}?autoplay=0&mute=0&controls=1&info=0&logo=0&related=0&start=0`;
    
    // Stwórz iframe
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.frameBorder = '0';
    iframe.allow = 'autoplay; fullscreen';
    iframe.allowFullScreen = true;
    iframe.style.border = '0';
    
    // Wyczyść container i dodaj iframe
    playerRef.current.innerHTML = '';
    playerRef.current.appendChild(iframe);

    // Ustaw player jako iframe
    setDmPlayer(iframe);
    setPlayerReady(true);
    console.log('Dailymotion iframe created successfully');

    // Nasłuchuj na postMessage z iframe
    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;

      console.log('Dailymotion message:', event.data);
      
      const { event: eventType, time, method, value } = event.data;
      
      if (eventType === 'play') {
        socket?.emit('player-action', { roomId, action: 'play' });
      } else if (eventType === 'pause') {
        socket?.emit('player-action', { roomId, action: 'pause' });
      } else if (eventType === 'seeked' && typeof time === 'number') {
        setCurrentTime(time);
        setLastSeekTime(time);
        socket?.emit('player-action', { roomId, action: 'seek', time });
      } else if (eventType === 'timeupdate' && typeof time === 'number') {
        setCurrentTime(time);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (playerRef.current) {
        playerRef.current.innerHTML = '';
      }
      setDmPlayer(null);
    };
  }, [videoId]);

  // Własny licznik czasu
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerState.playing) {
        setCurrentTime(prev => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [playerState.playing]);

  // Reset czasu gdy zmienia się video
  useEffect(() => {
    setCurrentTime(0);
    setPlayerState({ playing: false, time: 0 });
    setLastSeekTime(0);
  }, [videoId]);

  // Wylicz wysokość playera w trybie kinowym
  useEffect(() => {
    if (cinemaMode) {
      const w = window.innerWidth;
      const h = window.innerHeight - 80; // 80px na AppBar
      const idealH = w / 16 * 9;
      setCinemaHeight(Math.min(h, idealH));
    }
  }, [cinemaMode]);

  // Po dołączeniu do pokoju poproś o stan playera
  useEffect(() => {
    if (socket) {
      socket.emit('player-get-state', { roomId });
    }
  }, [socket, roomId]);

  // Synchronizacja z serwera
  useEffect(() => {
    if (!socket) return;

    socket.on('sync-request', ({ requestingUser, requestingTime }) => {
      if (requestingUser !== userName) {
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: `${requestingUser} prosi o synchronizację (czas: ${formatTime(requestingTime)})` 
        }]);
      }
    });

    socket.on('force-action', ({ action, fromUser }) => {
      if (fromUser !== userName) {
        if (action === 'play') {
          socket?.emit('player-action', { roomId, action: 'play' });
          setMessages(prev => [...prev, { 
            type: 'system', 
            message: `${fromUser} wymusił(a) odtwarzanie` 
          }]);
        } else if (action === 'pause') {
          socket?.emit('player-action', { roomId, action: 'pause' });
          setMessages(prev => [...prev, { 
            type: 'system', 
            message: `${fromUser} wymusił(a) pauzę` 
          }]);
        }
      }
    });

    socket.on('player-action', ({ action, time, fromUser }) => {
      if (fromUser !== userName) {
        if (action === 'seek' && typeof time === 'number') {
          setCurrentTime(time);
          setLastSeekTime(time);
          // Przeładuj iframe z nowym czasem
          if (dmPlayer && dmPlayer.src) {
            const newSrc = dmPlayer.src.replace(/&start=\d+/, `&start=${time}`);
            dmPlayer.src = newSrc;
          }
        }
      }
    });

    socket.on('player-state', (state) => {
      setPlayerState(state);
      if (typeof state.time === 'number') {
        setCurrentTime(state.time);
        setLastSeekTime(state.time);
        // Przeładuj iframe z nowym czasem
        if (dmPlayer && dmPlayer.src) {
          const newSrc = dmPlayer.src.replace(/&start=\d+/, `&start=${state.time}`);
          dmPlayer.src = newSrc;
        }
      }
    });

    return () => {
      socket.off('sync-request');
      socket.off('force-action');
      socket.off('player-action');
      socket.off('player-state');
    };
  }, [socket, userName, dmPlayer]);

  // Cleanup dla streamów
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  // Poprawiony efekt: po uzyskaniu localStream dynamicznie dodawaj tracki do wszystkich peer connections
  useEffect(() => {
    if (localStream) {
      Object.entries(peerConnections.current).forEach(([userId, pc]) => {
        const senders = pc.getSenders();
        localStream.getTracks().forEach(track => {
          if (!senders.find(sender => sender.track && sender.track.id === track.id)) {
            try {
              pc.addTrack(track, localStream);
              console.log('Added track to peer', userId, track);
            } catch (err) {
              console.error('Error adding track to peer', userId, err);
            }
          }
        });
      });
    }
  }, [localStream, users]);

  // Formatowanie czasu
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Funkcja synchronizacji do konkretnego czasu
  const handleSyncToTime = (targetTime) => {
    if (!socket) return;
    setCurrentTime(targetTime);
    setLastSeekTime(targetTime);
    
    // Przeładuj iframe z nowym czasem startowym
    if (dmPlayer && dmPlayer.src) {
      const newSrc = dmPlayer.src.replace(/&start=\d+/, `&start=${targetTime}`);
      dmPlayer.src = newSrc;
    }
    
    socket.emit('player-action', { roomId, action: 'seek', time: targetTime });
    setMessages(prev => [...prev, { 
      type: 'system', 
      message: `Przesunięto do ${formatTime(targetTime)}` 
    }]);
    console.log('Seek command sent:', targetTime);
  };

  // Funkcja do przełączania trybu kamery
  const toggleCameraMode = () => {
    setCameraMode(prev => prev === 'fixed' ? 'floating' : 'fixed');
  };

  // Funkcja do pełnego ekranu
  const handleFullscreen = () => {
    if (dmPlayer) {
      try {
        dmPlayer.requestFullscreen();
        console.log('Fullscreen command sent');
      } catch (error) {
        console.error('Błąd fullscreen:', error);
        // Fallback do iframe fullscreen
        if (dmPlayer.requestFullscreen) {
          dmPlayer.requestFullscreen();
        } else if (dmPlayer.webkitRequestFullscreen) {
          dmPlayer.webkitRequestFullscreen();
        } else if (dmPlayer.mozRequestFullScreen) {
          dmPlayer.mozRequestFullScreen();
        } else if (dmPlayer.msRequestFullscreen) {
          dmPlayer.msRequestFullscreen();
        }
      }
    }
  };

  // Drag & drop kamerki
  const handleCamMouseDown = (e) => {
    if (e.target.dataset.resize) return;
    setDragging(true);
    setDragOffset({
      x: e.clientX - camPos.x,
      y: e.clientY - camPos.y,
    });
  };
  const handleCamMouseMove = (e) => {
    if (dragging) {
      setCamPos({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    } else if (resizing) {
      setCamSize({
        w: Math.max(120, resizeStart.w + (e.clientX - resizeStart.x)),
        h: Math.max(90, resizeStart.h + (e.clientY - resizeStart.y)),
      });
    }
  };
  const handleCamMouseUp = () => {
    setDragging(false);
    setResizing(false);
  };
  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, w: camSize.w, h: camSize.h });
  };
  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleCamMouseMove);
      window.addEventListener('mouseup', handleCamMouseUp);
    } else {
      window.removeEventListener('mousemove', handleCamMouseMove);
      window.removeEventListener('mouseup', handleCamMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleCamMouseMove);
      window.removeEventListener('mouseup', handleCamMouseUp);
    };
    // eslint-disable-next-line
  }, [dragging, resizing]);

  // Funkcja do sprawdzania dostępności mediów
  const checkMediaAvailability = async () => {
    try {
      if (!navigator.mediaDevices) {
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: '❌ MediaDevices API nie jest dostępne' 
        }]);
        return;
      }

      if (!navigator.mediaDevices.getUserMedia) {
        setMessages(prev => [...prev, { 
          type: 'system', 
          message: '❌ getUserMedia nie jest dostępne' 
        }]);
        return;
      }

      // Sprawdź dostępność kamery
      const videoDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = videoDevices.filter(device => device.kind === 'videoinput');
      
      // Sprawdź dostępność mikrofonu
      const microphones = videoDevices.filter(device => device.kind === 'audioinput');

      setMessages(prev => [...prev, { 
        type: 'system', 
        message: `✅ Znaleziono ${cameras.length} kamer i ${microphones.length} mikrofonów` 
      }]);

      // Sprawdź uprawnienia
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      setMessages(prev => [...prev, { 
        type: 'system', 
        message: '✅ Uprawnienia do kamery i mikrofonu są dostępne' 
      }]);

    } catch (error) {
      setMessages(prev => [...prev, { 
        type: 'system', 
        message: `❌ Błąd sprawdzania mediów: ${error.message}` 
      }]);
    }
  };

  // Poprawiony useEffect na users:
  useEffect(() => {
    const myId = socket?.id || socketRef.current?.id;
    if (users.length > 0 && socket) {
      // Znajdź siebie w users
      const me = users.find(u => u.id === myId);
      if (me) {
        // Jeśli jestem nowy (mam najmniejszy index w users), inicjuję połączenia do innych
        const myIndex = users.findIndex(u => u.id === myId);
        if (myIndex === users.length - 1) { // jestem ostatni = nowy
          users.forEach(user => {
            if (user.id !== myId && !peerConnections.current[user.id]) {
              console.log('Creating peer connection to', user.id, 'myId:', myId);
              createPeerConnection(user.id);
            }
          });
        }
      }
    }
  }, [users, socket]);

  return (
    <Box sx={{ minHeight: '100vh', width: '100vw', bgcolor: 'background.default', background: 'linear-gradient(135deg, #23283a 0%, #181c24 100%)', p: 0, ...bitcountFont }}>
      <AppBar position="static" sx={{ mb: 0, boxShadow: 3, bgcolor: '#23283a !important', background: '#23283a !important', color: 'white' }}>
        <Toolbar sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2, px: { xs: 1, sm: 3 }, ...bitcountFont }}>
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{ letterSpacing: 2, color: 'white', mb: 0.5, ...bitcountFont, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            WatchParty
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', ...bitcountFont }}>
            <Typography variant="body1" sx={{ color: 'primary.light', fontWeight: 600, ...bitcountFont }}>
              ID pokoju:
            </Typography>
            <Paper elevation={0} sx={{ px: 2, py: 0.5, bgcolor: '#ffe082', borderRadius: 2, fontFamily: '"Bitcount Grid Double", system-ui', fontSize: 18, color: '#23283a', fontWeight: 700, letterSpacing: 1, ...bitcountFont }}>
              {roomId}
            </Paper>
            <Button
              onClick={handleCopy}
              color={copied ? 'success' : 'primary'}
              size="small"
              variant="contained"
              sx={{ minWidth: 90, ml: 1, py: 0.5, px: 2, fontWeight: 700, fontSize: 14, ...bitcountFont }}
              startIcon={<ContentCopyIcon fontSize="small" />}
            >
              {copied ? 'Skopiowano!' : 'Kopiuj'}
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box sx={{ width: '100%', maxWidth: '1800px', mx: 'auto', py: { xs: 2, md: 4 }, px: { xs: 1, md: 3 }, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, minHeight: 'calc(100vh - 120px)', ...bitcountFont }}>
        {/* Sekcja playera i kamerki */}
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 3, minWidth: 0, ...bitcountFont }}>
          <Paper elevation={6} sx={{ width: '100%', maxWidth: 950, borderRadius: 5, bgcolor: 'rgba(24,28,36,0.97)', minHeight: 480, boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', p: { xs: 1, sm: 3 }, ...bitcountFont }}>
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', ...bitcountFont, alignItems: 'center' }}>
              <TextField label="Link do Dailymotion" size="small" fullWidth value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetDm()} sx={{ bgcolor: 'background.paper', borderRadius: 1, ...bitcountFont, input: { ...bitcountFont }, label: { ...bitcountFont } }} InputLabelProps={{ style: { ...bitcountFont } }} />
              <Button variant="contained" onClick={handleSetDm} sx={{ minWidth: 120, fontWeight: 600, ...bitcountFont }}>
                Odtwórz
              </Button>
              {dmUrl && (
                <>
                  <IconButton onClick={handleFullscreen} color="primary" sx={{ ml: 1 }} title="Pełny ekran">
                    <FullscreenIcon />
                  </IconButton>
                  <IconButton onClick={() => setCinemaMode(v => !v)} color={cinemaMode ? 'secondary' : 'primary'} sx={{ ml: 1 }} title="Tryb kinowy">
                    <TheatersIcon />
                  </IconButton>
                  <IconButton 
                    onClick={toggleCameraMode} 
                    color={cameraMode === 'floating' ? 'secondary' : 'primary'} 
                    sx={{ ml: 1 }} 
                    title={cameraMode === 'fixed' ? 'Odczep kamerę' : 'Przypnij kamerę'}
                  >
                    {cameraMode === 'fixed' ? <OpenInNewIcon /> : <CloseIcon />}
                  </IconButton>
                  <Button 
                    onClick={checkMediaAvailability}
                    variant="outlined" 
                    color="warning" 
                    sx={{ ml: 1, fontWeight: 600, ...bitcountFont }}
                    title="Sprawdź dostępność kamery/mikrofonu"
                  >
                    Test mediów
                  </Button>
                  <TextField
                    size="small"
                    placeholder="MM:SS"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    sx={{ 
                      width: 80, 
                      ml: 1, 
                      bgcolor: 'background.paper', 
                      borderRadius: 1, 
                      ...bitcountFont, 
                      input: { ...bitcountFont, textAlign: 'center' } 
                    }}
                    InputLabelProps={{ style: { ...bitcountFont } }}
                  />
                  <Button 
                    onClick={() => {
                      const timeParts = manualTime.split(':');
                      if (timeParts.length === 2) {
                        const minutes = parseInt(timeParts[0]) || 0;
                        const seconds = parseInt(timeParts[1]) || 0;
                        const totalSeconds = minutes * 60 + seconds;
                        handleSyncToTime(totalSeconds);
                        setManualTime('');
                      }
                    }}
                    variant="outlined" 
                    color="info" 
                    sx={{ ml: 1, fontWeight: 600, ...bitcountFont }}
                    disabled={!manualTime}
                  >
                    Idź do
                  </Button>
                </>
              )}
            </Box>
            {/* Player i kamerka – jeden wspólny layout, styl zmienia się w zależności od trybu kinowego */}
            {videoId && (
              <Box
                sx={{
                  width: cinemaMode ? '100vw' : '100%',
                  maxWidth: cinemaMode ? '100vw' : undefined,
                  height: cinemaMode ? 'calc(100vh - 100px)' : undefined,
                  aspectRatio: !cinemaMode ? '16/9' : undefined,
                  borderRadius: 3,
                  overflow: 'hidden',
                  mb: 2,
                  boxShadow: '0 4px 24px 0 rgba(31, 38, 135, 0.15)',
                  position: cinemaMode ? 'fixed' : 'relative',
                  top: cinemaMode ? 64 : undefined,
                  left: cinemaMode ? 0 : undefined,
                  zIndex: cinemaMode ? 9999 : undefined,
                  bgcolor: cinemaMode ? '#181c24' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  right: cinemaMode ? 0 : undefined,
                  mx: cinemaMode ? 0 : undefined,
                  transition: 'all 0.4s cubic-bezier(.4,2,.6,1)',
                }}
              >
                <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                  <div
                    ref={playerRef}
                    style={{ width: '100%', height: '100%', border: 0 }}
                  />
                  {/* Kamerki */}
                  {cinemaMode ? (
                    <Box sx={{ position: 'absolute', right: 24, bottom: 24, display: 'flex', gap: 2, zIndex: 4000, flexWrap: 'wrap', maxWidth: 'calc(100vw - 48px)' }}>
                      {/* Twoja kamerka */}
                      <Box sx={{ width: 120, height: 90, border: '2px solid #23283a', borderRadius: 2, bgcolor: '#181c24', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                        {cameraOn && localStream ? (
                          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <VideocamOffIcon sx={{ fontSize: 32, color: 'grey.600' }} />
                        )}
                        {/* Nazwa użytkownika */}
                        <Box sx={{ 
                          position: 'absolute', 
                          top: 4, 
                          left: 4, 
                          bgcolor: 'rgba(0,0,0,0.7)', 
                          borderRadius: 1, 
                          px: 0.5, 
                          py: 0.25 
                        }}>
                          <Typography sx={{ color: 'white', fontSize: 10, fontWeight: 600 }}>
                            {userName}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Kamery innych użytkowników */}
                      {users.map(user => {
                        if (user.id === socket?.id) return null; // Pomiń siebie
                        const peerStream = peers[user.id];
                        
                        return (
                          <Box key={user.id} sx={{ 
                            width: 120, 
                            height: 90, 
                            border: '2px solid #23283a', 
                            borderRadius: 2, 
                            bgcolor: '#181c24', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            overflow: 'hidden',
                            position: 'relative'
                          }}>
                            {peerStream ? (
                              <video 
                                autoPlay 
                                playsInline 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                ref={el => {
                                  if (el) el.srcObject = peerStream;
                                }}
                              />
                            ) : (
                              <VideocamOffIcon sx={{ fontSize: 32, color: 'grey.800' }} />
                            )}
                            {/* Nazwa użytkownika */}
                            <Box sx={{ 
                              position: 'absolute', 
                              top: 8, 
                              left: 8, 
                              bgcolor: 'rgba(0,0,0,0.7)', 
                              borderRadius: 1, 
                              px: 1, 
                              py: 0.5 
                            }}>
                              <Typography sx={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                                {user.userName}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : null}
                </Box>
              </Box>
            )}
            {/* Kamerka pod playerem w trybie normalnym */}
            {!cinemaMode && cameraMode === 'fixed' && (
              <Box sx={{ 
                display: 'flex', 
                gap: 2, 
                justifyContent: 'center', 
                alignItems: 'center',
                mt: 2,
                p: 2,
                bgcolor: 'rgba(35,40,58,0.3)',
                borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.1)',
                flexWrap: 'wrap'
              }}>
                {/* Twoja kamerka */}
                <Box sx={{ 
                  width: 240, 
                  height: 180, 
                  border: '2px solid #23283a', 
                  borderRadius: 2, 
                  bgcolor: '#181c24', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {cameraOn && localStream ? (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      muted 
                      playsInline 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <VideocamOffIcon sx={{ fontSize: 48, color: 'grey.600' }} />
                  )}
                  {/* Kontrolki kamery */}
                  <Box sx={{ 
                    position: 'absolute', 
                    bottom: 8, 
                    left: 8, 
                    display: 'flex', 
                    gap: 1, 
                    bgcolor: 'rgba(0,0,0,0.7)', 
                    borderRadius: 1, 
                    p: 0.5 
                  }}>
                    <IconButton 
                      onClick={() => setCameraOn(v => !v)} 
                      color={cameraOn ? 'primary' : 'default'} 
                      size="small"
                      sx={{ color: 'white' }}
                    >
                      {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
                    </IconButton>
                    <IconButton 
                      onClick={() => setMicOn(v => !v)} 
                      color={micOn ? 'primary' : 'default'} 
                      size="small"
                      sx={{ color: 'white' }}
                    >
                      {micOn ? <MicIcon /> : <MicOffIcon />}
                    </IconButton>
                  </Box>
                  {/* Nazwa użytkownika */}
                  <Box sx={{ 
                    position: 'absolute', 
                    top: 8, 
                    left: 8, 
                    bgcolor: 'rgba(0,0,0,0.7)', 
                    borderRadius: 1, 
                    px: 1, 
                    py: 0.5 
                  }}>
                    <Typography sx={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                      {userName} (Ty)
                    </Typography>
                  </Box>
                </Box>

                {/* Kamery innych użytkowników */}
                {users.map(user => {
                  if (user.id === socket?.id) return null; // Pomiń siebie
                  const peerStream = peers[user.id];
                  
                  return (
                    <Box key={user.id} sx={{ 
                      width: 240, 
                      height: 180, 
                      border: '2px solid #23283a', 
                      borderRadius: 2, 
                      bgcolor: '#181c24', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {peerStream ? (
                        <video 
                          autoPlay 
                          playsInline 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          ref={el => {
                            if (el) el.srcObject = peerStream;
                          }}
                        />
                      ) : (
                        <VideocamOffIcon sx={{ fontSize: 48, color: 'grey.800' }} />
                      )}
                      {/* Nazwa użytkownika */}
                      <Box sx={{ 
                        position: 'absolute', 
                        top: 8, 
                        left: 8, 
                        bgcolor: 'rgba(0,0,0,0.7)', 
                        borderRadius: 1, 
                        px: 1, 
                        py: 0.5 
                      }}>
                        <Typography sx={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                          {user.userName}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Paper>
        </Box>
        {/* Sekcja czatu */}
        <Box sx={{ flex: 1, minWidth: 320, maxWidth: 500, display: cinemaMode ? 'none' : 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch', ...bitcountFont }}>
          <Fade in={chatOpen}>
            <Paper elevation={6} sx={{ p: { xs: 1, sm: 3 }, borderRadius: 5, bgcolor: 'rgba(35,40,58,0.97)', minHeight: 480, height: '100%', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', display: 'flex', flexDirection: 'column', ...bitcountFont }}>
              <Typography variant="h6" gutterBottom sx={{ color: 'white', letterSpacing: 1, fontWeight: 600, ...bitcountFont, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ChatIcon sx={{ mr: 0, fontSize: 28, verticalAlign: 'middle' }} />
                <span style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 1 }}>Czat</span>
              </Typography>
              <Divider sx={{ mb: 2, bgcolor: 'primary.main', opacity: 0.2 }} />
              <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, ...bitcountFont }}>
                {messages && messages
                  .filter(msg => msg && typeof msg === 'object' && msg.message)
                  .map((msg, i) => (
                    msg.type === 'system' ? (
                      <Box key={i} sx={{ mb: 1, textAlign: 'center', color: 'primary.light', fontStyle: 'italic', fontWeight: 600, ...bitcountFont }}>
                        {msg.message}
                      </Box>
                    ) : (
                      <Box key={i} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, ...bitcountFont }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontWeight: 700, ...bitcountFont }}>{msg.userName ? msg.userName[0] : '?'}</Avatar>
                        <Paper sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 2, ...bitcountFont }}><b>{msg.userName ? msg.userName : 'Gość'}:</b> {msg.message}</Paper>
                      </Box>
                    )
                  ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, ...bitcountFont }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Napisz wiadomość..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  sx={{ bgcolor: 'background.paper', borderRadius: 1, ...bitcountFont, input: { ...bitcountFont }, label: { ...bitcountFont } }}
                  InputLabelProps={{ style: { ...bitcountFont } }}
                />
                <IconButton color="primary" onClick={sendMessage} sx={{ ...bitcountFont }}>
                  <SendIcon />
                </IconButton>
              </Box>
            </Paper>
          </Fade>
          <IconButton onClick={() => setChatOpen(v => !v)} color="primary" sx={{ mt: 1, bgcolor: 'background.paper', boxShadow: 2, alignSelf: 'flex-end', ...bitcountFont }}>
            <ChatIcon />
          </IconButton>
          {/* Ikonka czatu w trybie kinowym */}
          {cinemaMode && (
            <IconButton onClick={() => setCinemaMode(false)} color="primary" sx={{ position: 'fixed', right: 32, top: 120, zIndex: 4001, bgcolor: '#23283a', boxShadow: 4 }}>
              <ChatIcon />
            </IconButton>
          )}
        </Box>
      </Box>
      {/* Przesuwalne i skalowalne okienko z kamerką w trybie normalnym */}
      {!cinemaMode && cameraMode === 'floating' && (
        <Box
          sx={{
            position: 'fixed',
            top: camPos.y,
            left: camPos.x,
            zIndex: 2000,
            cursor: dragging ? 'grabbing' : 'grab',
            width: camSize.w,
            height: camSize.h,
            boxShadow: 8,
            borderRadius: 3,
            bgcolor: '#181c24',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 1,
            userSelect: 'none',
            border: '2px solid #23283a',
            transition: 'border-color 0.2s',
          }}
          onMouseDown={handleCamMouseDown}
          onMouseEnter={() => setCamHover(true)}
          onMouseLeave={() => setCamHover(false)}
        >
          {cameraOn && localStream ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: camSize.h - 50, borderRadius: 8, background: '#222', objectFit: 'cover' }}
            />
          ) : (
            <Box sx={{ width: '100%', height: camSize.h - 50, borderRadius: 2, bgcolor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <VideocamOffIcon sx={{ fontSize: 40, color: 'grey.600' }} />
              <Typography sx={{ color: 'grey.400', fontSize: 14, mt: 1 }}>Kamerka wyłączona</Typography>
            </Box>
          )}
          {/* Ikonki pojawiają się tylko po najechaniu */}
          <Box sx={{ display: camHover ? 'flex' : 'none', gap: 1, mt: 1, alignItems: 'center', justifyContent: 'center' }}>
            <IconButton onClick={e => { e.stopPropagation(); setCameraOn(v => !v); }} color={cameraOn ? 'primary' : 'default'} size="small">
              {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={e => { e.stopPropagation(); setMicOn(v => !v); }} color={micOn ? 'primary' : 'default'} size="small">
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
          </Box>
          {/* Uchwyt do zmiany rozmiaru */}
          <Box
            data-resize
            onMouseDown={handleResizeMouseDown}
            sx={{
              position: 'absolute',
              right: 4,
              bottom: 4,
              width: 18,
              height: 18,
              cursor: 'nwse-resize',
              zIndex: 10,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              opacity: 0.7,
            }}
          >
            <Box sx={{ width: 12, height: 12, borderRight: '2px solid #23283a', borderBottom: '2px solid #23283a', borderRadius: 1 }} />
          </Box>
        </Box>
      )}
      {/* Pasek na górze w trybie kinowym */}
      {cinemaMode && (
        <AppBar position="fixed" sx={{ bgcolor: '#23283a', width: '100vw', boxShadow: 3, top: 0, left: 0, zIndex: 10000 }}>
          <Toolbar sx={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', px: 3 }}>
            <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: 2, color: 'white', ...bitcountFont, cursor: 'pointer' }} onClick={() => setCinemaMode(false)}>
              WatchParty
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body1" sx={{ color: 'primary.light', fontWeight: 600, ...bitcountFont }}>
                ID pokoju:
              </Typography>
              <Paper elevation={0} sx={{ px: 2, py: 0.5, bgcolor: '#23283a', borderRadius: 2, fontFamily: '"Bitcount Grid Double", system-ui', fontSize: 18, color: '#ffe082', fontWeight: 700, letterSpacing: 1, ...bitcountFont }}>
                {roomId}
              </Paper>
            </Box>
          </Toolbar>
        </AppBar>
      )}
      {/* Ikonka czatu w trybie kinowym */}
      {cinemaMode && (
        <IconButton onClick={() => setCinemaMode(false)} color="primary" sx={{ position: 'fixed', right: 32, top: 32, zIndex: 4001, bgcolor: '#23283a', boxShadow: 4 }}>
          <ChatIcon />
        </IconButton>
      )}
    </Box>
  );
} 