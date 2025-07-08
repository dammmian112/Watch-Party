import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Room from './Room';
import { Box, Paper, Typography, TextField, Button } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

const bitcountFont = {
  fontFamily: '"Bitcount Grid Double", system-ui',
  fontOpticalSizing: 'auto',
  fontVariationSettings: '"slnt" 0, "CRSV" 0.5, "ELSH" 0, "ELXP" 0',
};

function Home() {
  const [userName, setUserName] = React.useState('');
  const [roomId, setRoomId] = React.useState('');
  const navigate = window.navigate || ((url) => { window.location.href = url });

  const handleCreate = () => {
    if (!userName) return;
    const newRoom = uuidv4();
    navigate(`/room/${newRoom}?user=${encodeURIComponent(userName)}`);
  };

  const handleJoin = () => {
    if (!userName || !roomId) return;
    navigate(`/room/${roomId}?user=${encodeURIComponent(userName)}`);
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      background: 'linear-gradient(135deg, #23283a 0%, #181c24 100%)',
      p: 0,
      ...bitcountFont,
    }}>
      <Paper elevation={8} sx={{
        p: { xs: 3, sm: 5 },
        borderRadius: 5,
        minWidth: { xs: '90vw', sm: 400 },
        maxWidth: 420,
        bgcolor: 'rgba(24,28,36,0.95)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        ...bitcountFont,
      }}>
        <Typography variant="h3" fontWeight={700} gutterBottom align="center" sx={{ color: 'primary.main', mb: 2, letterSpacing: 2, ...bitcountFont }}>
          WatchParty
        </Typography>
        <TextField label="Twoje imię" fullWidth sx={{ mb: 3, bgcolor: '#fff', input: { color: '#23283a', fontWeight: 600, ...bitcountFont }, label: { ...bitcountFont }, borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#fff', borderColor: '#23283a', '&:hover': { bgcolor: '#fff', borderColor: '#23283a' }, '&.Mui-focused': { bgcolor: '#fff', borderColor: '#23283a' } } }} value={userName} onChange={e => setUserName(e.target.value)} InputLabelProps={{ style: { ...bitcountFont } }} />
        <Button variant="contained" color="primary" fullWidth sx={{ mb: 2, py: 1.5, fontWeight: 600, fontSize: 18, ...bitcountFont }} onClick={handleCreate}>Stwórz nowy pokój</Button>
        <Typography align="center" sx={{ my: 2, color: 'grey.400', fontWeight: 500, ...bitcountFont }}>lub</Typography>
        <TextField label="ID pokoju" fullWidth sx={{ mb: 3, bgcolor: '#fff', input: { color: '#23283a', fontWeight: 600, ...bitcountFont }, label: { ...bitcountFont }, borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#fff', borderColor: '#23283a', '&:hover': { bgcolor: '#fff', borderColor: '#23283a' }, '&.Mui-focused': { bgcolor: '#fff', borderColor: '#23283a' } } }} value={roomId} onChange={e => setRoomId(e.target.value)} InputLabelProps={{ style: { ...bitcountFont } }} />
        <Button variant="outlined" color="primary" fullWidth sx={{ py: 1.5, fontWeight: 600, fontSize: 18, ...bitcountFont }} onClick={handleJoin}>Dołącz do pokoju</Button>
      </Paper>
    </Box>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </Router>
  );
}
