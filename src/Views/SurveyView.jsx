import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../Servicios/Supabase";
import "./SurveyView.css";
import { regionesChile } from "../Utilidades/regionesChile";

import { 
  getPreguntas, 
  getOpciones, 
  insertarRespuesta, 
  subirFoto 
} from "../Servicios/PreguntaS";

import CuestionarioUnico from "../Components/Cuestionario/CuestionarioUnico";
import CuestionarioFoto from "../Components/Cuestionario/CuestionarioFoto";
import CuestionarioTexto from "../Components/Cuestionario/CuestionarioTexto";
import CuestionarioMultiple from "../Components/Cuestionario/CuestionarioMultiple";
import CuestionarioFirma from "../Components/Cuestionario/CuestionarioFirma";

const CONFIG_ENCUESTAS = {
  operario: {
    orden: { 15: 1, 32: 2, 18: 3, 19: 4, 16: 5, 17: 6, 20: 7, 21: 8, 23: 9, 24: 10, 33: 11,
      25: 12, 34: 13, 26: 14, 35: 15, 29: 16, 36: 17, 37: 18, 38: 19, 28: 20, 27: 21, 54: 22,
      39: 23, 52: 24, 53: 25},
    opcionales: []
  },
  limpieza:{
    orden: {39: 1, 52: 2, 53: 3, 40: 4, 41: 5, 42: 6, 43: 7, 44: 8, 45: 9, 46: 10, 47: 11, 48: 12, 49: 13,
      50:14, 51: 15},
    opcionales: [39, 52, 53]
  }
};

export default function SurveyView() {
  const [preguntas, setPreguntas] = useState([]);
  const [opcionesMap, setOpcionesMap] = useState({});
  const [respuestasValues, setRespuestasValues] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [regionActiva, setRegionActiva] = useState("");
  const [busquedaComuna, setBusquedaComuna] = useState("");

  const [choferes, setChoferes] = useState([]);
  const [auxiliares, setAuxiliares] = useState([]);

  const [observacionesExtra, setObservacionesExtra] = useState({}); 

  const handleCambioObservacion = (idPregunta, texto) => {
    setObservacionesExtra(prev => ({ ...prev, [idPregunta]: texto }));
  };

  const { idEncuesta, idUsuario } = useParams();
  const navigate = useNavigate();

  // 1. Recuperamos los datos del vendedor desde el sessionStorage
  const nombreVendedor = sessionStorage.getItem("nombreencuestado");
  const idSupervisor = sessionStorage.getItem("id_supervisor");
  const tipoActual = idEncuesta?.toLowerCase().includes("limpieza") ? "limpieza" : "operario";

  useEffect(() => {
  if (!idUsuario) { navigate("/"); return; }

  async function cargarDatosIniciales() {
    try {
      // Traer Choferes
      const { data: dataChoferes } = await supabase
        .from("personal_operativo")
        .select("id_personal, nombre_completo") // Traemos el ID también
        .eq("tipo_personal", "chofer")
        .eq("activo", true);
      if (dataChoferes) setChoferes(dataChoferes);

      // Traer Auxiliares (NUEVO)
      const { data: dataAuxiliares } = await supabase
        .from("personal_operativo")
        .select("id_personal, nombre_completo")
        .eq("tipo_personal", "auxiliar")
        .eq("activo", true);
      if (dataAuxiliares) setAuxiliares(dataAuxiliares);

      const listaTotal = await getPreguntas();
      
      // LOGS CRUCIALES - Mira estos en la consola (F12)
      // En SurveyView.jsx cambia la línea 46 por esta:
      console.log("Estructura de la primera pregunta:", listaTotal[0]);
      console.log("2. ¿Qué categoría busco?:", idEncuesta);

      // Filtramos con cuidado extremo (quitando espacios y comparando minúsculas)
      const filtradas = listaTotal.filter(p => {
        const catPregunta = String(p.tipo_formulario || "").trim().toLowerCase();
        const catURL = String(idEncuesta || "").trim().toLowerCase();
        return catPregunta === catURL;
      });

      console.log("3. Preguntas después de filtrar:", filtradas);

      const tipoActual = idEncuesta?.toLowerCase().includes("limpieza") ? "limpieza" : "operario";
      const mapaOrdenActual = CONFIG_ENCUESTAS[tipoActual]?.orden || {};

      const ordenadas = filtradas.sort((a, b) => {
        const ordenA = mapaOrdenActual[Number(a.idpregunta)] || 99;
        const ordenB = mapaOrdenActual[Number(b.idpregunta)] || 99;
        return ordenA - ordenB;
      });

      if (ordenadas.length === 0) {
        console.warn("AVISO: El filtro dejó 0 preguntas. Revisa si en Supabase escribiste 'operario' igual que en la URL.");
      }

      setPreguntas(ordenadas);

      const map = {};
      for (const p of ordenadas) {
        if (p.tipopregunta === "unica" || p.tipopregunta === "multiple") {
          map[p.idpregunta] = await getOpciones(p.idpregunta);
        }
      }
      setOpcionesMap(map);
    } catch (error) {
      console.error("Error grave en la carga:", error);
    }
  }
  cargarDatosIniciales();
}, [idEncuesta, idUsuario, navigate, tipoActual]);

  const handleCambioRespuesta = (idPregunta, valor) => {
    setRespuestasValues(prev => ({ ...prev, [idPregunta]: valor }));
  };

  const enviarFormulario = async (respuestasFinales) => {
    try {
      // 1. Recuperamos el ID del supervisor
      const idSup = sessionStorage.getItem("id_supervisor");

      if (!idSup || idSup === "undefined") {
        console.error("No se encontró id_supervisor en el almacenamiento.");
        return; // Detenemos si no hay a quién buscar
      }

      // 2. Buscamos los datos del supervisor en la base de datos
      const { data: supervisor, error: supError } = await supabase
        .from("supervisor")
        .select("email, nombre")
        .eq("id_supervisor", Number(idSup))
        .maybeSingle();

      if (supError || !supervisor) {
        console.error("Error al buscar supervisor:", supError);
        return;
      }

      // 3. Invocamos la Edge Function de Supabase
      const { error: invokeError } = await supabase.functions.invoke('enviar-correo', {
        body: {
          email: supervisor.email,        // Destinatario dinámico
          nombreSupervisor: supervisor.nombre,
          encuestado: nombreVendedor,     // Declarado arriba en el componente
          respuestas: respuestasFinales   // Array con textos y fotos
        },
      });

      if (invokeError) throw invokeError;
      
      console.log("Notificación enviada con éxito a:", supervisor.email);

    } catch (err) {
      console.error("Error crítico en el flujo de notificación:", err);
    }
  };

  const finalizarEncuesta = async () => {
    let idPersonalSeleccionado = null;
    let patenteSeleccionada = null;

    const configActual = CONFIG_ENCUESTAS[tipoActual];

    // Forzamos la lectura limpia de las respuestas para evitar desfases de estado en producción
    const respuestasActuales = { ...respuestasValues };

    for (const p of preguntas) {
      const idPreg = Number(p.idpregunta);
      const valor = respuestasActuales[p.idpregunta];
      const desc = p.descripcion?.toLowerCase().trim() || "";

      if (desc.includes("chofer") || desc.includes("conductor")) idPersonalSeleccionado = valor;
      if (desc.includes("patente")) patenteSeleccionada = valor;

      const esOpcionalPorPalabra = desc.includes("transporte");
      const esOpcionalPorConfig = configActual?.opcionales?.map(Number).includes(idPreg);
      
      // BLINDAJE ULTRA REFORZADO
      const esPreguntaAuxiliar = idPreg === 54 || desc.includes("auxiliar") || desc.includes("auxilíar");
      const esRealmenteOpcional = esOpcionalPorPalabra || esOpcionalPorConfig || esPreguntaAuxiliar;

      // REVISIÓN EN VIVO PARA EL CELULAR
      if (idPreg === 54) {
        alert(`DATOS AUXILIAR EN CELULAR:\n- ID: ${idPreg}\n- Valor actual: "${valor}"\n- ¿Es opcional por código?: ${esRealmenteOpcional ? "SÍ" : "NO"}`);
      }

      if (!esRealmenteOpcional && (valor === null || valor === undefined || String(valor).trim() === "")) {
        alert(`La pregunta "${p.descripcion}" es obligatoria.`);
        return; 
      }
    }
    
    // --- CONTROL DE SEGURIDAD (Solo para la encuesta de camión) ---
    const esOperario = idEncuesta?.toLowerCase().includes("operario");
    if (esOperario && (!idPersonalSeleccionado || String(idPersonalSeleccionado).trim() === "" || !patenteSeleccionada || String(patenteSeleccionada).trim() === "")) {
      alert("Error crítico: No se ha detectado el Chofer o la Patente. Verifique los campos antes de enviar.");
      return;
    }

    try {
      setIsProcessing(true);
      const listaParaCorreo = [];
      const esLimpieza = idEncuesta?.toLowerCase().includes("limpieza");

      let tablaDestino = "respuestas_operario";
      if (esLimpieza) tablaDestino = "respuestas_limpieza";
      if (!esOperario && !esLimpieza) tablaDestino = "respuesta";

      // Creamos la cabecera en la base de datos
      const { data: cabecera, error: errCabecera } = await supabase
        .from('formularios_hechos')
        .insert([{
          id_usuario: parseInt(idUsuario),
          tipo_formulario: idEncuesta,
          id_supervisor: parseInt(idSupervisor)
        }])
        .select()
        .single();

      if (errCabecera) throw new Error("Error al crear cabecera: " + errCabecera.message);
      const nuevoIdFormulario = cabecera.id_formulario;

      // Guardado de las respuestas en lote/bucle
      for (const p of preguntas) {
        const valor = respuestasActuales[p.idpregunta];
        const tipo = p.tipopregunta ? p.tipopregunta.trim().toLowerCase() : "";
        let urlFoto = null;
        let textoCorreo = valor;

        const basePayload = {
          id_formulario_vinculado: nuevoIdFormulario,
          idpregunta: p.idpregunta,
          fotourl: null,
          idopcion: null,
          descripcion: null
        };
        
        // 1. Fotos y Firmas
        if ((tipo === "foto" || tipo === "firma") && valor) {
          let archivoParaSubir = valor.blob ? valor.blob : valor;

          if (archivoParaSubir instanceof Blob || archivoParaSubir instanceof File || (typeof archivoParaSubir === 'string' && archivoParaSubir.includes(','))) {
            try {
              urlFoto = await subirFoto(archivoParaSubir, nombreVendedor || "Usuario");
            } catch (e) {
              console.error("Error subiendo imagen:", e);
            }
          } else {
            urlFoto = typeof archivoParaSubir === 'string' && archivoParaSubir.startsWith('http') ? archivoParaSubir : null;
          }
          
          await insertarRespuesta({ ...basePayload, fotourl: urlFoto }, tablaDestino);
        }

        // 2. Selección Única
        else if (tipo === "unica") {
          const comentarioExtra = observacionesExtra[p.idpregunta] || null;
          await insertarRespuesta({
            ...basePayload,
            idopcion: parseInt(valor) || null,
            descripcion: comentarioExtra
          }, tablaDestino);
          const opt = opcionesMap[p.idpregunta]?.find(o => String(o.idopcion) === String(valor));
          textoCorreo = opt ? (comentarioExtra ? `${opt.descripcion} (Nota: ${comentarioExtra})` : opt.descripcion) : valor;
        } 
        
        // 3. Selección Múltiple
        else if (tipo === "multiple" && valor) {
          const ids = String(valor).split(",");
          const nombresSeleccionados = [];
          for (const idStr of ids) {
            const idLimpio = idStr.trim();
            await insertarRespuesta({ ...basePayload, idopcion: parseInt(idLimpio) }, tablaDestino);
            const opt = opcionesMap[p.idpregunta]?.find(o => String(o.idopcion) === idLimpio);
            nombresSeleccionados.push(opt ? opt.descripcion : idLimpio);
          }
          textoCorreo = nombresSeleccionados.join(", ");
        } 
        
        // 4. Texto / Selects Dinámicos
        else {
          const esPreguntaChofer = p.descripcion.toLowerCase().includes("chofer") || p.descripcion.toLowerCase().includes("conductor");
          const esPreguntaAuxiliar = p.descripcion.toLowerCase().includes("auxiliar");

          const payload = { ...basePayload, descripcion: valor ? String(valor) : null };

          if ((esPreguntaChofer || esPreguntaAuxiliar) && valor) {
            payload.id_personal_respondido = parseInt(valor);
            const persona = [...choferes, ...auxiliares].find(per => String(per.id_personal) === String(valor));
            textoCorreo = persona ? persona.nombre_completo : valor;
          }

          await insertarRespuesta(payload, tablaDestino);
        }

        listaParaCorreo.push({
          pregunta: p.descripcion,
          respuesta: urlFoto || textoCorreo,
          fotourl: urlFoto
        });
      }

      if (!esOperario && !esLimpieza) {
        await enviarFormulario(listaParaCorreo);
      }
      
      let tipoParaGracias = 'vendedor';
      if (esOperario) tipoParaGracias = 'operario';
      if (esLimpieza) tipoParaGracias = 'limpieza';

      navigate("/gracias", { state: { tipo: tipoParaGracias } });

    } catch (error) {
      console.error("Error crítico al finalizar:", error);
      alert("Hubo un problema al guardar la encuesta: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

const idLow = String(idEncuesta).toLowerCase();
const tituloDinamico = idLow.includes("operario") 
  ? "Checklist Camión" 
  : idLow.includes("limpieza") 
    ? "Checklist Limpieza" 
    : "Registro de Visita";

const badgeLabel = (idLow.includes("operario") || idLow.includes("limpieza"))
  ? "Operador: " 
  : "Vendedor: ";

  return (
    <div className="cuestionario-wrapper">
      <div className="cuestionario-container">
        {/* TÍTULO ACTUALIZADO */}
        <h1 className="titulo-encuesta">
          {tituloDinamico}
        </h1>

        <div className="vendedor-badge">
          {badgeLabel} 
          <strong>{nombreVendedor}</strong>
        </div>

        {preguntas.map((p, index) => {
          const esOperario = idEncuesta?.toLowerCase().includes("operario");
          // Usamos la constante que sacamos fuera
          const mapaOrdenActual = CONFIG_ENCUESTAS[tipoActual]?.orden || {};
          const numeroOrden = mapaOrdenActual[p.idpregunta];

          return (
            <div key={p.idpregunta}>
              {/* SECCIÓN 1: Solo Operario, Orden 1 */}
              {esOperario && numeroOrden === 1 && (
                <div className="seccion-titulo-container">
                  <h2 className="titulo-seccion-moderno">Tipo de documentación y seguridad</h2>
                  <hr className="separador-verde" />
                </div>
              )}

              {/* SECCIÓN 2: Solo Operario, Orden 8 */}
              {esOperario && numeroOrden === 8 && (
                <div className="seccion-titulo-container" style={{ marginTop: '40px' }}>
                  <h2 className="titulo-seccion-moderno">Revisión exterior</h2>
                  <hr className="separador-verde" />
                </div>
              )}

              <div className="cuestionario-card section-pregunta">
                <h3 className="pregunta-descripcion">{p.descripcion}</h3>

                {/* CASO ÚNICA */}
                {p.tipopregunta === "unica" && (
                  <> 
                    <CuestionarioUnico 
                      opciones={opcionesMap[p.idpregunta] || []} 
                      onNext={(val) => handleCambioRespuesta(p.idpregunta, val)} 
                      currentValue={respuestasValues[p.idpregunta]}
                    />
                    
                    {(() => {
                      const opcionElegida = opcionesMap[p.idpregunta]?.find(
                        o => String(o.idopcion) === String(respuestasValues[p.idpregunta])
                      );
                      
                      const descripcionUpper = opcionElegida?.descripcion?.toUpperCase() || "";
                      const mostrarInput = descripcionUpper.includes("REQUIERE ATENCIÓN") || 
                                          descripcionUpper === "OTRO";

                      return mostrarInput ? (
                        <textarea
                          className="input-texto-moderno"
                          placeholder="Especifique el motivo o detalle..."
                          style={{ 
                            marginTop: '15px', 
                            height: '90px', 
                            padding: '12px',
                            borderColor: '#1FB436', 
                            borderWidth: '2px',
                            width: '100%',
                            borderRadius: '8px',
                            display: 'block' // Asegura que ocupe su propia línea
                          }}
                          value={observacionesExtra[p.idpregunta] || ""}
                          onChange={(e) => handleCambioObservacion(p.idpregunta, e.target.value)}
                        />
                      ) : null;
                    })()}
                  </>
                )}

                {/* CASO FOTO */}
                {p.tipopregunta === "foto" && (
                  <CuestionarioFoto onNext={(val) => handleCambioRespuesta(p.idpregunta, val)} />
                )}

                {/* CASO FIRMA */}
                {p.tipopregunta === "firma" && (
                  <CuestionarioFirma onNext={(val) => handleCambioRespuesta(p.idpregunta, val)} />
                )}

                {/* CASO MÚLTIPLE */}
                {p.tipopregunta === "multiple" && (
                  <CuestionarioMultiple 
                    opciones={opcionesMap[p.idpregunta] || []} 
                    currentValue={respuestasValues[p.idpregunta] || ""}
                    onChange={(val) => handleCambioRespuesta(p.idpregunta, val)}
                  />
                )}

                {/* CASO TEXTO (Chofer, Región y Comuna filtrable) */}
                {p.tipopregunta === "texto" && (
                  <>
                    {(p.descripcion.toLowerCase().includes("chofer") || p.descripcion.toLowerCase().includes("conductor")) ? (
                      <select 
                        className="input-texto-moderno"
                        value={respuestasValues[p.idpregunta] || ""}
                        onChange={(e) => handleCambioRespuesta(p.idpregunta, e.target.value)}
                      >
                        <option value="">- Seleccione un Chofer -</option>
                        {choferes.map((c) => (
                          <option key={c.id_personal} value={c.id_personal}>
                            {c.nombre_completo}
                          </option>
                        ))}
                      </select>
                    ) : p.descripcion.toLowerCase().includes("auxiliar") ? (
                      <select 
                        className="input-texto-moderno"
                        value={respuestasValues[p.idpregunta] || ""}
                        onChange={(e) => handleCambioRespuesta(p.idpregunta, e.target.value)}
                      >
                        <option value="">- Seleccione Auxiliar -</option>
                        {auxiliares.map((a) => (
                          <option key={a.id_personal} value={a.id_personal}>
                            {a.nombre_completo}
                          </option>
                        ))}
                      </select>
                    ) : (p.descripcion.toLowerCase().includes("región") || p.descripcion.toLowerCase().includes("region")) ? (
                      <select 
                        className="input-texto-moderno"
                        value={respuestasValues[p.idpregunta] || ""}
                        onChange={(e) => {
                          setRegionActiva(e.target.value);
                          handleCambioRespuesta(p.idpregunta, e.target.value);
                          // Limpiar comuna si cambia la región
                          const pComuna = preguntas.find(preg => preg.descripcion.toLowerCase().includes("comuna"));
                          if (pComuna) handleCambioRespuesta(pComuna.idpregunta, "");
                        }}
                      >
                        <option value="">-- Seleccione Región --</option>
                        {regionesChile.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                      </select>
                    ) : p.descripcion.toLowerCase().includes("comuna") ? (
                      <div className="searchable-select-container">
                        <input 
                          type="text" 
                          className="input-texto-moderno"
                          placeholder={regionActiva ? "Escribe para buscar comuna..." : "Seleccione región primero"}
                          value={respuestasValues[p.idpregunta] || busquedaComuna}
                          disabled={!regionActiva}
                          onChange={(e) => setBusquedaComuna(e.target.value)}
                        />
                        {regionActiva && busquedaComuna && !respuestasValues[p.idpregunta] && (
                          <ul className="sugerencias-lista">
                            {regionesChile
                              .find(r => r.region === regionActiva)
                              ?.comunas.filter(c => c.toLowerCase().includes(busquedaComuna.toLowerCase()))
                              .map(comuna => (
                                <li key={comuna} onClick={() => {
                                  handleCambioRespuesta(p.idpregunta, comuna);
                                  setBusquedaComuna(comuna);
                                }}>
                                  {comuna}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <CuestionarioTexto 
                        onNext={(val) => handleCambioRespuesta(p.idpregunta, val)}
                        currentValue={respuestasValues[p.idpregunta]}
                        placeholder={p.descripcion}
                        // SI EL ID ES 54, SE VOLVERÁ UN TEXTAREA AUTOMÁTICAMENTE
                        multiline={p.idpregunta === 54 || p.descripcion.toLowerCase().includes("comentario")}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <button 
          className="btn-siguiente btn-finalizar" 
          onClick={finalizarEncuesta} 
          disabled={isProcessing}
        >
          {isProcessing ? "Enviando Reporte..." : "Finalizar y Enviar"}
        </button>
      </div>
    </div>
  );
}