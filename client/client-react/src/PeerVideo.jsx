import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';

function PeerVideo({ stream, userName, cinemaMode = false }) {
  const videoRef = useRef();
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  const videoStyle = {
    width: cinemaMode ? 120 : 240,
    height: cinemaMode ? 90 : 180,
    objectFit: 'cover',
    borderRadius: cinemaMode ? 4 : 8,
    border: '2px solid #23283a'
  };
  
  return (
    <Box>
      <video ref={videoRef} autoPlay playsInline style={videoStyle} />
      <Typography 
        align="center" 
        sx={{ 
          color: 'white', 
          fontSize: cinemaMode ? 10 : 12, 
          fontWeight: 600,
          lineHeight: cinemaMode ? 1.2 : 1.4
        }}
      >
        {userName}
      </Typography>
    </Box>
  );
}

export default PeerVideo; 