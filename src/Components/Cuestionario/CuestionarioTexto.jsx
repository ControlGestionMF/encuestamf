import { useState } from "react";

function validarRut(rut) {
  rut = rut.replace(/\./g, "").replace("-", "");

  if (!/^\d{7,8}[0-9kK]$/.test(rut)) return false;

  const cuerpo = rut.slice(0, -1);
  let dv = rut.slice(-1).toUpperCase();

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += multiplo * cuerpo[i];
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const dvEsperado = 11 - (suma % 11);
  const dvFinal =
    dvEsperado === 11 ? "0" :
    dvEsperado === 10 ? "K" :
    dvEsperado.toString();

  return dv === dvFinal;
}

// Máscara para teléfono +56 9 XXXX XXXX
const aplicarMascaraTelefono = (valor) => {
  // 1. Quitamos todo lo que no sea número
  let num = valor.replace(/\D/g, "");

  // 2. Si el usuario empezó a escribir "569...", le quitamos el "56" 
  // para que no se duplique, ya que el +56 lo ponemos nosotros fijos.
  if (num.startsWith("56")) {
    num = num.slice(2);
  }

  // 3. Limitamos a 9 dígitos máximo (el estándar móvil en Chile: 9XXXXXXXX)
  num = num.slice(0, 9);

  // 4. Vamos construyendo el formato paso a paso
  if (num.length === 0) return "";
  if (num.length === 1) return `+56 ${num}`;
  if (num.length <= 5) return `+56 ${num.slice(0, 1)} ${num.slice(1)}`;
  
  // Formato final: +56 9 XXXX XXXX
  return `+56 ${num.slice(0, 1)} ${num.slice(1, 5)} ${num.slice(5)}`;
};

export default function CuestionarioTexto({
  onNext,
  placeholder = "",
  tipoValidacion = "texto",
  disabled,
  currentValue = "",
  multiline = false
}) {
  const [valor, setValor] = useState(currentValue);
  const [error, setError] = useState(false);

  const handleChange = (e) => {
    let nuevoValor = e.target.value;

    // 1. Lógica por tipo de validación
    if (tipoValidacion === "telefono") {
      nuevoValor = aplicarMascaraTelefono(nuevoValor);
      setValor(nuevoValor);
      
      // Es válido si tiene el largo completo del formato (+56 9 XXXX XXXX = 15 chars)
      const esValido = nuevoValor.length === 15;
      setError(!esValido && nuevoValor.length > 4);
      onNext(esValido ? nuevoValor : null);

    } else if (tipoValidacion === "email") {
      setValor(nuevoValor);
      const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const esValido = regexEmail.test(nuevoValor);
      setError(!esValido && nuevoValor.length > 0);
      onNext(esValido ? nuevoValor : null);

    } else if (tipoValidacion === "rut") {
      setValor(nuevoValor);
      const esValido = validarRut(nuevoValor);
      setError(!esValido && nuevoValor.length > 0);
      onNext(esValido ? nuevoValor : null);

    } else {
      // Texto normal
      setValor(nuevoValor);
      onNext(nuevoValor);
    }
  };

  // Determinar mensaje de error según el tipo
  const getMensajeError = () => {
    if (tipoValidacion === "rut") return "RUT inválido. Formato: 12345678-9";
    if (tipoValidacion === "telefono") return "Número incompleto. Formato: +56 9 XXXX XXXX";
    if (tipoValidacion === "email") return "Correo electrónico inválido (ejemplo@mail.com)";
    return "";
  };

  return (
    <div className="input-container">
      {multiline ? (
        <textarea
          className={`input-texto-moderno ${error ? "input-error" : ""}`}
          value={valor}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          rows="4"
          style={{ minHeight: '120px', resize: 'vertical' }}
        />
      ) : (
        <input
          type={tipoValidacion === "email" ? "email" : "text"}
          className={`input-texto-moderno ${error ? "input-error" : ""}`}
          value={valor}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
      {error && (
        <span className="error-mensaje" style={{ color: 'red', fontSize: '0.8rem' }}>
          {getMensajeError()}
        </span>
      )}
    </div>
  );
}