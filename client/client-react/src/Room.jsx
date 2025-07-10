import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, TextField, Button, Avatar, Fade, AppBar, Toolbar, Divider } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import TheatersIcon from '@mui/icons-material/Theaters';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import useWebRTC from './useWebRTC';
import PeerVideo from './PeerVideo';
import { useCallback } from 'react';

const bitcountFont = {
  fontFamily: '"Bitcount Grid Double", system-ui',
  fontOpticalSizing: 'auto',
  fontVariationSettings: '"slnt" 0, "CRSV" 0.5, "ELSH" 0, "ELXP" 0',
};

function ResizableCameraBox({ children, defaultHeight = 140, minHeight = 80, maxHeight = 320 }) {
  const [height, setHeight] = useState(defaultHeight);
  const boxRef = useRef();
  const dragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    const startY = e.clientY;
    const startHeight = height;
    const onMouseMove = (moveEvent) => {
      if (!dragging.current) return;
      const delta = moveEvent.clientY - startY;
      let newHeight = startHeight + delta;
      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > maxHeight) newHeight = maxHeight;
      setHeight(newHeight);
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [height, minHeight, maxHeight]);

  return (
    <Box ref={boxRef} sx={{
      height,
      minHeight,
      maxHeight,
      width: '100%',
      position: 'relative',
      mb: 1,
      bgcolor: 'rgba(35,40,58,0.7)',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: 2,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      userSelect: dragging.current ? 'none' : 'auto',
      transition: dragging.current ? 'none' : 'height 0.2s',
    }}>
      <Box sx={{ flex: 1, width: '100%', height: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' }}>
        {/* Rozciągamy PeerVideo na całość */}
        {React.cloneElement(children, {
          style: { width: '100%', height: '100%', objectFit: 'cover' }
        })}
      </Box>
      {/* Uchwyt do zmiany rozmiaru */}
      <Box
        onMouseDown={onMouseDown}
        sx={{
          height: 10,
          width: '100%',
          cursor: 'ns-resize',
          bgcolor: dragging.current ? '#ffe082' : 'rgba(255,255,255,0.08)',
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: 30, height: 3, bgcolor: '#ffe082', borderRadius: 2, opacity: 0.7 }} />
      </Box>
    </Box>
  );
}

function detectPlayerType(url) {
  if (!url) return null;
  if (/dailymotion\.com\/video\//.test(url)) return 'dailymotion';
  if (/drive\.google\.com\/file\//.test(url)) return 'gdrive';
  if (/mega\.nz\//.test(url)) return 'mega';
  if (/cda\.pl\//.test(url)) return 'cda';
  if (/mp4upload\.com\//.test(url)) return 'mp4upload';
  if (/\.(mp4|webm|ogg)(\?.*)?$/.test(url)) return 'mp4';
  return 'unknown';
}

export default function Room() {
  const navigate = useNavigate();
  const {
    localStream,
    peers,
    cameraOn,
    micOn,
    setCameraOn,
    setMicOn,
    users,
    socket,
    userName,
    roomId
  } = useWebRTC();

  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [cameraMode, setCameraMode] = useState('fixed');
  const playerRef = useRef();
  const [playerInput, setPlayerInput] = useState('');
  const [playerData, setPlayerData] = useState({ url: '', type: null });
  const [playerInstance, setPlayerInstance] = useState(null);
  const [videoId, setVideoId] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [lastSeekTime, setLastSeekTime] = useState(0);
  const [manualTime, setManualTime] = useState('');

  // Minimalny czat (tylko lokalny, bo globalny jest przez socket w useWebRTC)
  const sendMessage = () => {
    if (message.trim() && socket) {
      socket.emit('chat-message', { roomId, userName, message });
      setMessage('');
    }
  };

  // Kopiowanie ID pokoju
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Synchronizacja linku do filmu Dailymotion
  useEffect(() => {
    if (!socket) return;
    socket.on('player-url', (data) => {
      console.log('Received player-url from server:', data);
      setPlayerData(data);
      setPlayerInput(data.url);
      if (data.type === 'dailymotion') {
        const match = data.url.match(/\/video\/([a-zA-Z0-9]+)/);
        if (match) setVideoId(match[1]);
      }
    });
    // Po wejściu do pokoju pobierz aktualny link
    socket.emit('get-player-url', { roomId });
    return () => socket.off('player-url');
  }, [socket, roomId]);

  // Obsługa Dailymotion
  const handleSetPlayer = () => {
    if (playerInput && socket) {
      const type = detectPlayerType(playerInput);
      setPlayerData({ url: playerInput, type });
      socket.emit('set-player-url', { roomId, url: playerInput, type });
      if (type === 'dailymotion') {
        const match = playerInput.match(/\/video\/([a-zA-Z0-9]+)/);
        if (match) setVideoId(match[1]);
      }
    }
  };

  // Inicjalizacja Dailymotion Player API
  useEffect(() => {
    console.log('Player useEffect triggered:', { videoId, playerRef: !!playerRef.current });
    if (!videoId || !playerRef.current) {
      console.log('Missing videoId or playerRef:', { videoId, playerRef: !!playerRef.current });
      return;
    }
    
    console.log('Creating Dailymotion player for videoId:', videoId);
    
    // Wyczyść poprzedni player
    if (playerInstance) setPlayerInstance(null);
    
    // Użyj prostego embed URL z start=0
    const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}?autoplay=0&mute=0&controls=1&info=0&logo=0&related=0&start=0`;
    console.log('Embed URL:', embedUrl);
    
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
    setPlayerInstance(iframe);
    
    console.log('Dailymotion iframe created and added to player');
    
    // Nasłuchuj na postMessage z iframe (dla synchronizacji)
    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;
      const { event: eventType, time } = event.data;
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
      if (playerRef.current) playerRef.current.innerHTML = '';
      setPlayerInstance(null);
    };
  }, [videoId]);

  // Funkcja do seekowania w playerze
  const seekToTime = (seconds) => {
    console.log('seekToTime called with seconds:', seconds);
    if (!playerInstance || !videoId) {
      console.log('No player or videoId available');
      return;
    }
    
    // Stwórz nowy URL z parametrem start
    const newEmbedUrl = `https://www.dailymotion.com/embed/video/${videoId}?autoplay=0&mute=0&controls=1&info=0&logo=0&related=0&start=${seconds}`;
    console.log('New embed URL with start time:', newEmbedUrl);
    
    // Zaktualizuj src iframe
    playerInstance.src = newEmbedUrl;
    console.log('Player src updated to seek to time:', seconds);
  };

  // Synchronizacja z serwera
  useEffect(() => {
    if (!socket) return;
    socket.on('player-action', ({ action, time, fromUser }) => {
      console.log('Received player-action:', { action, time, fromUser });
      if (action === 'seek' && typeof time === 'number') {
        console.log('Seeking to time from socket:', time);
        setCurrentTime(time);
        setLastSeekTime(time);
        seekToTime(time);
      }
    });
    return () => socket.off('player-action');
  }, [socket, playerInstance, videoId]);

  // --- CHAT SOCKET HANDLER ---
  useEffect(() => {
    if (!socket) return;
    
    // Handle chat messages
    const chatHandler = (msg) => {
      setMessages(prev => [...prev, msg]);
    };
    
    // Handle user join/leave messages
    const joinHandler = ({ id, userName }) => {
      if (userName) {
        setMessages(prev => [...prev, {
          userName: 'System',
          message: `${userName} dołączył do pokoju`
        }]);
      }
    };
    
    const leaveHandler = ({ id, userName }) => {
      if (userName) {
        setMessages(prev => [...prev, {
          userName: 'System',
          message: `${userName} opuścił pokój`
        }]);
      }
    };
    
    socket.on('chat-message', chatHandler);
    socket.on('user-joined', joinHandler);
    socket.on('user-left', leaveHandler);
    
    return () => {
      socket.off('chat-message', chatHandler);
      socket.off('user-joined', joinHandler);
      socket.off('user-left', leaveHandler);
    };
  }, [socket, users]);

  return (
    <Box sx={{ minHeight: '100vh', width: '100vw', bgcolor: 'background.default', background: 'linear-gradient(135deg, #23283a 0%, #181c24 100%)', ...bitcountFont }}>
      <AppBar position="static" sx={{ mb: 0, boxShadow: 3, bgcolor: '#23283a !important', color: 'white' }}>
        <Toolbar sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2, px: { xs: 1, sm: 3 }, ...bitcountFont }}>
          <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: 2, color: 'white', mb: 0.5, cursor: 'pointer', ...bitcountFont }} onClick={() => navigate('/')}>
            WatchParty
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', ...bitcountFont }}>
            <Typography variant="body1" sx={{ color: 'primary.light', fontWeight: 600, ...bitcountFont }}>
              ID pokoju:
            </Typography>
            <Paper elevation={0} sx={{ px: 2, py: 0.5, bgcolor: '#ffe082', borderRadius: 2, fontSize: 18, color: '#23283a', fontWeight: 700, letterSpacing: 1, ...bitcountFont }}>
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
      {/* --- PLAYER + KAMERKI + CHAT --- */}
      <Box sx={{ 
        width: '100%', 
        maxWidth: cinemaMode ? '100%' : '1800px', 
        mx: 'auto', 
        p: 0,
        display: 'flex',
        flexDirection: cinemaMode ? 'row' : { xs: 'column', md: 'row' },
        gap: 0,
        height: '100vh',
        minHeight: 0,
        overflow: cinemaMode ? 'hidden' : 'visible',
        ...bitcountFont 
      }}>
        {/* Player */}
        <Box sx={{ 
          flex: cinemaMode ? '2 1 0%' : 2, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: 0,
          minWidth: 0, 
          minHeight: 0,
          height: '100%',
          ...bitcountFont 
        }}>
          <Paper elevation={6} sx={{ 
            width: '100%', 
            maxWidth: cinemaMode ? '100%' : 950, 
            borderRadius: cinemaMode ? 0 : 5, 
            bgcolor: 'rgba(24,28,36,0.97)', 
            minHeight: cinemaMode ? 'calc(100vh - 200px)' : 480, 
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', 
            position: 'relative', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'flex-start', 
            p: cinemaMode ? 1 : 2, 
            height: '100%',
            minHeight: 0,
            boxSizing: 'border-box',
            ...bitcountFont 
          }}>
            {/* --- INPUTS NAD PLAYEREM --- */}
            <Box sx={{
              mb: 3,
              px: { xs: 1, sm: 2 },
              py: 2,
              borderRadius: 2,
              bgcolor: 'rgba(24,28,36,0.92)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              gap: 2,
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              boxShadow: '0 2px 8px 0 rgba(31, 38, 135, 0.10)'
            }}>
              <TextField
                size="small"
                placeholder="Wklej link do filmu lub serwisu (Dailymotion, GDrive, Mega, CDA, mp4upload, mp4)..."
                value={playerInput}
                onChange={e => setPlayerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetPlayer()}
                sx={{ 
                  bgcolor: 'rgba(35,40,58,0.97)', 
                  borderRadius: 2, 
                  minWidth: { xs: '100%', sm: 200 },
                  maxWidth: { xs: '100%', sm: 350 },
                  flex: { xs: 'none', sm: 2 },
                  fontSize: 16,
                  input: { fontSize: 16, ...bitcountFont },
                  label: { ...bitcountFont },
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    fontSize: 16,
                    borderRadius: 2,
                    '& fieldset': {
                      borderColor: 'rgba(255,255,255,0.10)',
                    },
                    '&:hover fieldset': {
                      borderColor: '#ffe082',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'primary.main',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: 'white',
                    fontSize: 16,
                    '&::placeholder': {
                      color: 'rgba(255,255,255,0.7)',
                      opacity: 1,
                    },
                  },
                }}
                InputLabelProps={{ style: { ...bitcountFont } }}
              />
              <Button
                onClick={handleSetPlayer}
                variant="contained"
                color="primary"
                size="medium"
                sx={{ 
                  minWidth: { xs: '100%', sm: 80 }, 
                  py: 1, 
                  px: 2.5, 
                  fontWeight: 700, 
                  fontSize: 15, 
                  borderRadius: 2,
                  bgcolor: '#ffe082',
                  color: '#23283a',
                  boxShadow: 'none',
                  textTransform: 'none',
                  transition: '0.2s',
                  ...bitcountFont,
                  '&:hover': {
                    bgcolor: '#ffd54f',
                    color: '#181c24',
                    boxShadow: 'none',
                  }
                }}
              >
                Idź do
              </Button>
              {/* --- SEEK --- */}
              <TextField
                size="small"
                placeholder="min:sek (np. 3:30)"
                value={manualTime}
                onChange={e => setManualTime(e.target.value)}
                sx={{
                  bgcolor: 'rgba(35,40,58,0.97)',
                  borderRadius: 2,
                  minWidth: { xs: '100%', sm: 90 },
                  maxWidth: { xs: '100%', sm: 120 },
                  fontSize: 16,
                  input: { fontSize: 16, ...bitcountFont },
                  label: { ...bitcountFont },
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    fontSize: 16,
                    borderRadius: 2,
                    '& fieldset': {
                      borderColor: 'rgba(255,255,255,0.10)',
                    },
                    '&:hover fieldset': {
                      borderColor: '#ffe082',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'primary.main',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: 'white',
                    fontSize: 16,
                    '&::placeholder': {
                      color: 'rgba(255,255,255,0.7)',
                      opacity: 1,
                    },
                  },
                }}
                InputLabelProps={{ style: { ...bitcountFont } }}
              />
              <Button
                onClick={() => {
                  console.log('Idź do minuty clicked with manualTime:', manualTime);
                  // Parse min:sec
                  let sec = 0;
                  if (/^\d+:\d+$/.test(manualTime)) {
                    const [m, s] = manualTime.split(':').map(Number);
                    sec = m * 60 + s;
                    console.log('Parsed min:sec format:', { m, s, sec });
                  } else if (/^\d+$/.test(manualTime)) {
                    sec = Number(manualTime);
                    console.log('Parsed seconds format:', sec);
                  } else {
                    console.log('Invalid time format:', manualTime);
                    return;
                  }
                  console.log('Final seconds to seek:', sec);
                  if (sec > 0) {
                    console.log('Seeking to seconds:', sec);
                    console.log('playerInstance exists:', !!playerInstance);
                    console.log('videoId exists:', !!videoId);
                    
                    // Seek locally
                    seekToTime(sec);
                    
                    // Sync to all users
                    console.log('Emitting socket player-action with time:', sec);
                    socket?.emit('player-action', { roomId, action: 'seek', time: sec });
                  } else {
                    console.log('Invalid seconds value:', sec);
                  }
                }}
                variant="contained"
                color="secondary"
                size="medium"
                sx={{ minWidth: { xs: '100%', sm: 100 }, py: 1, px: 2.5, fontWeight: 700, fontSize: 15, borderRadius: 2, boxShadow: 'none', textTransform: 'none', transition: '0.2s', ...bitcountFont, '&:hover': { bgcolor: '#ffb300', color: '#181c24', boxShadow: 'none' } }}
              >
                Idź do minuty
              </Button>
            </Box>
            {/* Player placeholder */}
            <Box ref={playerRef} sx={{ width: '100%', aspectRatio: '16/9', bgcolor: '#111', borderRadius: 3, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative', overflow: 'hidden' }}>
              {playerData.url && playerData.type === 'dailymotion' && videoId && (
                <iframe
                  src={`https://www.dailymotion.com/embed/video/${videoId}?autoplay=0&mute=0&controls=1&info=0&logo=0&related=0&start=0`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                  title="Dailymotion Player"
                />
              )}
              {playerData.url && playerData.type === 'gdrive' && (
                <iframe
                  src={playerData.url.replace('/view', '/preview')}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                  title="Google Drive Player"
                />
              )}
              {playerData.url && playerData.type === 'cda' && (
                <iframe
                  src={`https://ebd.cda.pl/620x368/${playerData.url.split('/').pop()}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                  title="CDA Player"
                />
              )}
              {playerData.url && playerData.type === 'mp4upload' && (
                <iframe
                  src={playerData.url.replace('mp4upload.com/', 'mp4upload.com/embed-').replace(/\.html$/, '')}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                  title="mp4upload Player"
                />
              )}
              {playerData.url && playerData.type === 'mp4' && (
                <video src={playerData.url} width="100%" height="100%" controls style={{ background: '#000', borderRadius: 8 }} />
              )}
              {playerData.url && playerData.type === 'mega' && (
                <Box sx={{ color: 'white', p: 2, textAlign: 'center' }}>
                  <b>Odtwarzanie z MEGA nie jest wspierane bezpośrednio w playerze.<br/>Skopiuj link i otwórz w nowej karcie.</b>
                </Box>
              )}
              {playerData.url && playerData.type === 'unknown' && (
                <Box sx={{ color: 'white', p: 2, textAlign: 'center' }}>
                  <b>Nieobsługiwany link lub serwis.</b>
                </Box>
              )}
            </Box>
            {/* Kamerki - tylko jeśli nie tryb kinowy */}
            {!cinemaMode && (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'row',
                gap: 2, 
                flexWrap: 'nowrap', 
                justifyContent: 'center', 
                alignItems: 'center', 
                mt: 2, 
                // Usuwam tło, border, padding, box nie wychodzi poza Paper
                bgcolor: 'transparent',
                borderRadius: 0,
                border: 'none',
                p: 0,
                maxHeight: 320,
                overflowX: 'auto',
                overflowY: 'hidden',
                width: '100%'
              }}>
                <PeerVideo stream={localStream} userName={userName + ' (Ty)'} cinemaMode={cinemaMode} width={300} height={300} />
                {Object.entries(peers).map(([peerId, stream]) => {
                  const userObj = users.find(u => u.id === peerId);
                  const label = userObj ? userObj.userName : peerId;
                  return <PeerVideo key={peerId} stream={stream} userName={label} cinemaMode={cinemaMode} width={300} height={300} />;
                })}
              </Box>
            )}
            {/* Przyciski kamera/mikrofon */}
            <Box sx={{ 
              display: 'flex', 
              gap: cinemaMode ? 1 : 2, 
              mt: cinemaMode ? 1 : 2, 
              justifyContent: 'center',
              p: cinemaMode ? 0.5 : 0
            }}>
              <IconButton 
                onClick={() => setCameraOn(v => !v)} 
                color={cameraOn ? 'primary' : 'default'} 
                size={cinemaMode ? 'medium' : 'large'}
                sx={{ 
                  bgcolor: cinemaMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: cinemaMode ? 'rgba(255,255,255,0.2)' : undefined }
                }}
              >
                {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
              </IconButton>
              <IconButton 
                onClick={() => setMicOn(v => !v)} 
                color={micOn ? 'primary' : 'default'} 
                size={cinemaMode ? 'medium' : 'large'}
                sx={{ 
                  bgcolor: cinemaMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: cinemaMode ? 'rgba(255,255,255,0.2)' : undefined }
                }}
              >
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </IconButton>
              <IconButton 
                onClick={() => setCinemaMode(v => !v)} 
                color={cinemaMode ? 'secondary' : 'primary'} 
                size={cinemaMode ? 'medium' : 'large'}
                sx={{ 
                  bgcolor: cinemaMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: cinemaMode ? 'rgba(255,255,255,0.2)' : undefined }
                }}
              >
                <TheatersIcon />
              </IconButton>
              <IconButton 
                onClick={() => setCameraMode(m => m === 'fixed' ? 'floating' : 'fixed')} 
                color={cameraMode === 'floating' ? 'secondary' : 'primary'} 
                size={cinemaMode ? 'medium' : 'large'}
                sx={{ 
                  bgcolor: cinemaMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': { bgcolor: cinemaMode ? 'rgba(255,255,255,0.2)' : undefined }
                }}
              >
                {cameraMode === 'fixed' ? <OpenInNewIcon /> : <CloseIcon />}
              </IconButton>
            </Box>
          </Paper>
        </Box>
        {/* Panel boczny: w trybie kinowym tylko kamerki, w zwykłym tylko chat */}
        <Box sx={{
          flex: '0 0 340px',
          minWidth: 220,
          maxWidth: 400,
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          overflowY: 'auto',
          bgcolor: 'rgba(24,28,36,0.97)',
          borderLeft: { xs: 'none', md: '2px solid #23283a' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
          p: 2,
          boxSizing: 'border-box',
          zIndex: 10
        }}>
          {/* Kamerki tylko w trybie kinowym */}
          {cinemaMode && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2, justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <PeerVideo stream={localStream} userName={userName + ' (Ty)'} cinemaMode={cinemaMode} width={300} height={300} sx={{ maxWidth: '100%' }} />
              {Object.entries(peers).map(([peerId, stream]) => {
                const userObj = users.find(u => u.id === peerId);
                const label = userObj ? userObj.userName : peerId;
                return <PeerVideo key={peerId} stream={stream} userName={label} cinemaMode={cinemaMode} width={300} height={300} sx={{ maxWidth: '100%' }} />;
              })}
            </Box>
          )}
          {/* Chat tylko w trybie zwykłym */}
          {!cinemaMode && (
            <>
              <IconButton onClick={() => setChatOpen(v => !v)} color="primary" sx={{ mb: 1, bgcolor: 'background.paper', boxShadow: 2, alignSelf: 'flex-end', ...bitcountFont }}>
                <ChatIcon />
              </IconButton>
              <Fade in={chatOpen}>
                <Paper elevation={6} sx={{ p: 2, borderRadius: 5, bgcolor: 'rgba(35,40,58,0.97)', minHeight: 0, maxHeight: '100%', height: '100%', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'auto', boxSizing: 'border-box', ...bitcountFont }}>
                  <Typography variant="h6" gutterBottom sx={{ color: 'white', letterSpacing: 1, fontWeight: 600, ...bitcountFont, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ChatIcon sx={{ mr: 0, fontSize: 28, verticalAlign: 'middle' }} />
                    <span style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 1 }}>Czat</span>
                  </Typography>
                  <Divider sx={{ mb: 2, bgcolor: 'primary.main', opacity: 0.2 }} />
                  <Box sx={{ flex: '1 1 0%', minHeight: 0, maxHeight: '100%', height: '100%', overflowY: 'auto', mb: 0, ...bitcountFont }}>
                    {messages.map((msg, i) => (
                      msg.userName === 'System' ? (
                        <Box key={i} sx={{ mb: 1, pl: 1 }}>
                          <Typography sx={{ color: 'grey.500', fontSize: 13, fontStyle: 'italic', ...bitcountFont }}>{msg.message}</Typography>
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
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
