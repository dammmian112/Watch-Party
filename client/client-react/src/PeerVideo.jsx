import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';

function PeerVideo({ stream, userName, cinemaMode = false, width = 300, height = 300, sx }) {
  const videoRef = useRef();
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  // Sprawdź czy video track jest wyłączony lub nie istnieje
  let videoOff = false;
  if (stream) {
    const tracks = stream.getVideoTracks();
    if (!tracks.length || tracks[0].enabled === false) videoOff = true;
  } else {
    videoOff = true;
  }
  const videoStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: cinemaMode ? 4 : 8,
    border: '2px solid #23283a',
    background: '#000',
  };
  
  return (
    <Box sx={{ width, height, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'stretch', ...sx }}>
      {!videoOff && (
        <video ref={videoRef} autoPlay playsInline muted={userName.endsWith(' (Ty)')} style={videoStyle} />
      )}
      {videoOff && (
        <Box sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111',
          borderRadius: cinemaMode ? 4 : 8,
          border: '2px solid #23283a',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 2
        }}>
          <VideocamOffIcon sx={{ fontSize: 60, color: '#888' }} />
        </Box>
      )}
      <Typography 
        align="center" 
        sx={{ 
          color: 'white', 
          fontSize: cinemaMode ? 10 : 12, 
          fontWeight: 600,
          lineHeight: cinemaMode ? 1.2 : 1.4,
          position: 'absolute',
          bottom: 2,
          left: 0,
          width: '100%',
          textShadow: '0 1px 4px #000',
          pointerEvents: 'none'
        }}
      >
        {userName}
      </Typography>
    </Box>
  );
}

export default PeerVideo; 