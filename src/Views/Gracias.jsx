import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // Importamos useLocation
import './Gracias.css';

export default function Gracias() {
  const navigate = useNavigate();
  const location = useLocation();

  // Leemos el tipo de usuario desde el estado de la navegación
  const tipoUsuario = location.state?.tipo; 

  const manejarFinalizar = () => {
    // Definimos la lógica de retorno según el tipo
    if (tipoUsuario === 'operario') {
      navigate('/encuesta/operario');
    } else if (tipoUsuario === 'limpieza') {
      navigate('/encuesta/limpieza');
    } else if (tipoUsuario === 'vendedor') {
      navigate('/encuesta/vendedor');
    } else {
      navigate('/'); // Fallback por si acaso
    }
  };

  return (
    <div className="gracias-container">
      <div className="gracias-card">
        <div className="check-icon-container">
          <svg viewBox="0 0 24 24" className="check-svg">
            <path 
              fill="none" 
              stroke="white" 
              strokeWidth="3" 
              d="M5 13l4 4L19 7" 
            />
          </svg>
        </div>

        <button 
          className="btn-volver-inicio"
          onClick={manejarFinalizar} // Usamos la nueva función
        >
          Finalizar sesión
        </button>
      </div>
    </div>
  );
}