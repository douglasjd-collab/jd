import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SimuladorEscolha() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(createPageUrl('SimuladorNormal'), { replace: true });
  }, []);

  return null;
}