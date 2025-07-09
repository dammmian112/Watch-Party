import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';

function PeerVideo({ stream, userName }) {
  const videoRef = useRef();
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <Box>
      <video ref={videoRef} autoPlay playsInline style={{ width: 240, height: 180, objectFit: 'cover', borderRadius: 8, border: '2px solid #23283a' }} />
      <Typography align="center" sx={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{userName}</Typography>
    </Box>
  );
}

export default PeerVideo; 