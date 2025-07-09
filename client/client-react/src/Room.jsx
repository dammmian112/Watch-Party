import React, { useState, useRef } from 'react';
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
import useWebRTC from './useWebRTC';
import PeerVideo from './PeerVideo';

const bitcountFont = {
  fontFamily: 'system-ui',
};

export default function Room() {
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

  return (
    <Box sx={{ minHeight: '100vh', width: '100vw', bgcolor: 'background.default', background: 'linear-gradient(135deg, #23283a 0%, #181c24 100%)', ...bitcountFont }}>
      <AppBar position="static" sx={{ mb: 0, boxShadow: 3, bgcolor: '#23283a !important', color: 'white' }}>
        <Toolbar sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2, px: { xs: 1, sm: 3 }, ...bitcountFont }}>
          <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: 2, color: 'white', mb: 0.5, ...bitcountFont }}>
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
      <Box sx={{ width: '100%', maxWidth: '1800px', mx: 'auto', py: 2, px: 2, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, minHeight: 'calc(100vh - 120px)', ...bitcountFont }}>
        {/* Player + kamerki */}
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0, ...bitcountFont }}>
          <Paper elevation={6} sx={{ width: '100%', maxWidth: 950, borderRadius: 5, bgcolor: 'rgba(24,28,36,0.97)', minHeight: 480, boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', p: 2, ...bitcountFont }}>
            {/* Player placeholder */}
            <Box ref={playerRef} sx={{ width: '100%', aspectRatio: '16/9', bgcolor: '#111', borderRadius: 3, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Typography variant="h6">Tu będzie player</Typography>
            </Box>
            {/* Kamerki */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', mt: 2, p: 2, bgcolor: 'rgba(35,40,58,0.3)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
              <PeerVideo stream={localStream} userName={userName + ' (Ty)'} />
              {Object.entries(peers).map(([peerId, stream]) => {
                const userObj = users.find(u => u.id === peerId);
                const label = userObj ? userObj.userName : peerId;
                return <PeerVideo key={peerId} stream={stream} userName={label} />;
              })}
            </Box>
            {/* Przyciski kamera/mikrofon */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'center' }}>
              <IconButton onClick={() => setCameraOn(v => !v)} color={cameraOn ? 'primary' : 'default'} size="large">
                {cameraOn ? <VideocamIcon /> : <VideocamOffIcon />}
              </IconButton>
              <IconButton onClick={() => setMicOn(v => !v)} color={micOn ? 'primary' : 'default'} size="large">
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </IconButton>
              <IconButton onClick={() => setCinemaMode(v => !v)} color={cinemaMode ? 'secondary' : 'primary'} size="large">
                <TheatersIcon />
              </IconButton>
              <IconButton onClick={() => setCameraMode(m => m === 'fixed' ? 'floating' : 'fixed')} color={cameraMode === 'floating' ? 'secondary' : 'primary'} size="large">
                {cameraMode === 'fixed' ? <OpenInNewIcon /> : <CloseIcon />}
              </IconButton>
            </Box>
          </Paper>
        </Box>
        {/* Czat */}
        <Box sx={{ flex: 1, minWidth: 320, maxWidth: 500, display: cinemaMode ? 'none' : 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch', ...bitcountFont }}>
          <Fade in={chatOpen}>
            <Paper elevation={6} sx={{ p: 2, borderRadius: 5, bgcolor: 'rgba(35,40,58,0.97)', minHeight: 480, height: '100%', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)', display: 'flex', flexDirection: 'column', ...bitcountFont }}>
              <Typography variant="h6" gutterBottom sx={{ color: 'white', letterSpacing: 1, fontWeight: 600, ...bitcountFont, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ChatIcon sx={{ mr: 0, fontSize: 28, verticalAlign: 'middle' }} />
                <span style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 1 }}>Czat</span>
              </Typography>
              <Divider sx={{ mb: 2, bgcolor: 'primary.main', opacity: 0.2 }} />
              <Box sx={{ flex: 1, overflowY: 'auto', mb: 2, ...bitcountFont }}>
                {messages.map((msg, i) => (
                  <Box key={i} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, ...bitcountFont }}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontWeight: 700, ...bitcountFont }}>{msg.userName ? msg.userName[0] : '?'}</Avatar>
                    <Paper sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 2, ...bitcountFont }}><b>{msg.userName ? msg.userName : 'Gość'}:</b> {msg.message}</Paper>
                  </Box>
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
        </Box>
      </Box>
      {/* Debug panel */}
      <Box sx={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999, background: '#fff', p: 1, maxWidth: 400, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
        <div><b>Peers:</b> {Object.keys(peers).length}</div>
        {Object.entries(peers).map(([id, stream]) => (
          <div key={id}>
            <div>User: {id}</div>
            <div>Tracks: {stream && stream.getTracks ? stream.getTracks().map(t => t.kind).join(', ') : 'none'}</div>
          </div>
        ))}
        <div><b>LocalStream:</b> {localStream ? localStream.getTracks().map(t => t.kind).join(', ') : 'none'}</div>
      </Box>
    </Box>
  );
}
