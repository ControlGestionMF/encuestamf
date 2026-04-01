import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

const dataURLtoBlob = (dataurl) => {
  let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
}

export default function CuestionarioFirma({ onNext, isProcessing }) {
  const sigCanvas = useRef({});
  const [error, setError] = useState(null);
  const [fijado, setFijado] = useState(false);

  const limpiar = () => {
    sigCanvas.current.clear();
    setError(null);
    setFijado(false);
  };

  const guardar = () => {
    setError(null);
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
        const canvas = sigCanvas.current.getCanvas();
        const dataURL = canvas.toDataURL('image/png');
        const imagenBlob = dataURLtoBlob(dataURL);
        
        onNext({
          base64: dataURL,
          blob: imagenBlob
        });
        
        setFijado(true);
        console.log("Firma fijada correctamente");
    } else {
        setError("Por favor, firma antes de continuar.");
    }
  };

  return (
    <div className="firma-container" style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
        Firme dentro del recuadro
      </p>
      
      {/* AJUSTE 1: Aplicamos pointer-events y opacidad dinámica */}
      <div 
        className="canvas-wrapper" 
        style={{ 
          pointerEvents: fijado ? 'none' : 'auto', 
          opacity: fijado ? 0.7 : 1,
          transition: 'all 0.3s ease'
        }}
      >
        <SignatureCanvas 
          ref={sigCanvas}
          canvasProps={{ 
            width: 320,
            height: 200, 
            className: 'sigCanvas' 
          }}
          backgroundColor="#ffffff"
          penColor="#004d40"
          // AJUSTE 2: Quitamos onBegin para que no se desbloquee solo al tocar
        />
      </div>
      
      {fijado && !error && (
        <div className="mensaje-exito-firma">
           <span className="tick-verde">✔</span> Firma fijada correctamente
        </div>
      )}

      {error && (
        <p className="error-message">{error}</p>
      )}

      <div className="botones-firma">
        <button 
          type="button" 
          className="btn-limpiar" 
          onClick={limpiar} 
          disabled={isProcessing}
        >
          {fijado ? "Cambiar firma" : "Limpiar"}
        </button>
        <button 
          type="button"
          className={`btn-guardar ${fijado ? 'fijado' : ''}`}
          onClick={guardar} 
          disabled={isProcessing || fijado} // AJUSTE 3: Deshabilitar si ya está fijado
        >
          {isProcessing ? "Procesando..." : fijado ? "Firma Guardada" : "Fijar Firma"}
        </button>
      </div>

      <style jsx>{`
        /* ESTILO PARA EL MENSAJE DEL TICK */
        .mensaje-exito-firma {
          margin-top: 15px;
          padding: 8px 12px;
          background-color: #e8f5e9;
          color: #2e7d32;
          border-radius: 8px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid #c8e6c9;
        }

        .tick-verde {
          background-color: #2e7d32;
          color: white;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
        }

        .canvas-wrapper {
          border: 2px dashed #004d40;
          border-radius: 12px;
          display: inline-block;
          overflow: hidden;
          background: white;
        }
        
        .botones-firma {
          margin-top: 15px;
          display: flex;
          gap: 10px;
          justify-content: center;
        }

        button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-limpiar { background-color: #f5f5f5; color: #666; }
        .btn-guardar { background-color: #004d40; color: white; }
        .btn-guardar.fijado { background-color: #1FB436; } /* Cambia a verde brillante al fijar */
        
        button:disabled { opacity: 0.5; }
        .error-message { color: #e74c3c; font-size: 0.85rem; margin-top: 10px; }
      `}</style>
    </div>
  );
}