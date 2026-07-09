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
          .select("id_personal, nombre_completo") 
          .eq("tipo_personal", "chofer")
          .eq("activo", true);
        if (dataChoferes) setChoferes(dataChoferes);

        // Traer Auxiliares
        const { data: dataAuxiliares } = await supabase
          .from("personal_operativo")
          .select("id_personal, nombre_completo")
          .eq("tipo_personal", "auxiliar")
          .eq("activo", true);
        if (dataAuxiliares) setAuxiliares(dataAuxiliares);

        const listaTotal = await getPreguntas();
        
        console.log("Estructura de la primera pregunta:", listaTotal[0]);
        console.log("2. ¿Qué categoría busco?:", idEncuesta);

        // Filtramos con cuidado extremo
        const filtradas = listaTotal.filter(p => {
          const catPregunta = String(p.tipo_formulario || "").trim().toLowerCase();
          const catURL = String(idEncuesta || "").trim().toLowerCase();
          return catPregunta === catURL;
        });

        console.log("3. Preguntas después de filtrar:", filtradas);

        // CORREGIDO: Usamos directamente la variable externa tipoActual en vez de redeclararla
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
      const idSup = sessionStorage.getItem("id_supervisor");

      if (!idSup || idSup === "undefined") {
        console.error("No se encontró id_supervisor en el almacenamiento.");
        return;
      }

      const { data: supervisor, error: supError } = await supabase
        .from("supervisor")
        .select("email, nombre")
        .eq("id_supervisor", Number(idSup))
        .maybeSingle();

      if (supError || !supervisor) {
        console.error("Error al buscar supervisor:", supError);
        return;
      }

      const { error: invokeError } = await supabase.functions.invoke('enviar-correo', {
        body: {
          email: supervisor.email,
          nombreSupervisor: supervisor.nombre,
          encuestado: nombreVendedor,
          respuestas: respuestasFinales
        },
      });

      if (invokeError) throw invokeError;
      console.log("Notificación enviada con éxito a:", supervisor.email);

    } catch (err) {
      console.error("Error crítico en el flujo de notificación:", err);
    }
  };

  const finalizarEncuesta = async () => {
    const configActual = CONFIG_ENCUESTAS[tipoActual];
    const respuestasActuales = { ...respuestasValues };
    const esOperario = idEncuesta?.toLowerCase().includes("operario");
    const esLimpieza = idEncuesta?.toLowerCase().includes("limpieza");

    let idPersonalSeleccionado = null;
    let patenteSeleccionada = null;

    // ==========================================
    // PASO 1: VALIDACIÓN DE OBLIGATORIEDAD
    // ==========================================
    for (const p of preguntas) {
      const idPreg = Number(p.idpregunta);
      const valor = respuestasActuales[p.idpregunta];
      const desc = p.descripcion?.toLowerCase().trim() || "";

      if (desc.includes("chofer") || desc.includes("conductor")) idPersonalSeleccionado = valor;
      if (desc.includes("patente")) patenteSeleccionada = valor;

      const esOpcionalPorPalabra = desc.includes("transporte");
      const esOpcionalPorConfig = configActual?.opcionales?.map(Number).includes(idPreg);
      const esPreguntaAuxiliar = idPreg === 54 || desc.includes("auxiliar") || desc.includes("auxilíar");
      
      const esRealmenteOpcional = esOpcionalPorPalabra || esOpcionalPorConfig || esPreguntaAuxiliar;

      if (!esRealmenteOpcional && (valor === null || valor === undefined || String(valor).trim() === "")) {
        alert(`La pregunta "${p.descripcion}" es obligatoria.`);
        return; 
      }
    }
    
    // --- CONTROL DE SEGURIDAD EXCLUSIVO PARA OPERARIO ---
    if (esOperario) {
      if (!idPersonalSeleccionado || !patenteSeleccionada) {
        for (const p of preguntas) {
          const desc = p.descripcion?.toLowerCase().trim() || "";
          if ((desc.includes("chofer") || desc.includes("conductor")) && respuestasActuales[p.idpregunta]) {
            idPersonalSeleccionado = respuestasActuales[p.idpregunta];
          }
          if (desc.includes("patente") && respuestasActuales[p.idpregunta]) {
            patenteSeleccionada = respuestasActuales[p.idpregunta];
          }
        }
      }

      if (!idPersonalSeleccionado || String(idPersonalSeleccionado).trim() === "") {
        alert("Atención: No se ha detectado la selección del Chofer. Por favor, selecciónelo nuevamente.");
        return;
      }
      if (!patenteSeleccionada || String(patenteSeleccionada).trim() === "") {
        alert("Atención: No se ha detectado la Patente del vehículo. Por favor, verifique el campo.");
        return;
      }
    }

    // =================================================================
    // CANDADO DIARIO (VALIDEZ PARA CHOFER SELECCIONADO)
    // =================================================================
    if (idPersonalSeleccionado) {
      try {
        setIsProcessing(true);

        const inicioHoy = new Date();
        inicioHoy.setHours(0, 0, 0, 0);

        const finHoy = new Date();
        finHoy.setHours(23, 59, 59, 999);

        // Debug 1: Ver qué datos está recibiendo el componente al intentar guardar
        console.log("=== DATOS ENTRANTES AL CANDADO ===");
        console.log("ID Personal Seleccionado:", idPersonalSeleccionado);
        console.log("Tipo (esLimpieza):", esLimpieza, " | Tipo (esOperario):", esOperario);
        console.log("Rango Buscado Local:", inicioHoy.toString(), "hasta", finHoy.toString());
        console.log("Rango Buscado ISO:", inicioHoy.toISOString(), "hasta", finHoy.toISOString());

        // 1. Busquemos TODOS los formularios de hoy sin importar el tipo primero, para ver si encuentra algo
        const { data: todosHoy, error: errTodos } = await supabase
          .from('formularios_hechos')
          .select('id_formulario, tipo_formulario, fecha')
          .gte('fecha', inicioHoy.toISOString())
          .lte('fecha', finHoy.toISOString());

        if (errTodos) console.error("Error trayendo formularios hechos:", errTodos);
        
        console.log("Formularios totales encontrados hoy en la base de datos:", todosHoy);

        if (todosHoy && todosHoy.length > 0) {
          const idsFormulariosHoy = todosHoy.map(f => f.id_formulario);
          
          let tablaCheck = "respuestas_operario";
          if (esLimpieza) tablaCheck = "respuestas_limpieza";
          if (!esOperario && !esLimpieza) tablaCheck = "respuesta";

          console.log(`Buscando en la tabla [${tablaCheck}] usando los IDs:`, idsFormulariosHoy);

          // 2. Buscamos si el ID de la persona existe en esas respuestas
          const { data: coincidencias, error: errMatch } = await supabase
            .from(tablaCheck)
            .select('id_respuesta, id_formulario_vinculado, id_personal_respondido')
            .in('id_formulario_vinculado', idsFormulariosHoy);

          if (errMatch) console.error("Error buscando coincidencias en respuestas:", errMatch);

          console.log("Todas las respuestas encontradas para los formularios de hoy:", coincidencias);

          // Evaluamos manualmente en JavaScript para asegurar que no haya problemas de tipos (string vs int)
          const yaExiste = coincidencias?.some(resp => 
            String(resp.id_personal_respondido) === String(idPersonalSeleccionado)
          );

          if (yaExiste) {
            console.log("¡MATCH ENCONTRADO! El chofer ya existe en los registros de hoy.");
            
            const persona = [...choferes, ...auxiliares].find(per => String(per.id_personal) === String(idPersonalSeleccionado));
            const nombreChofer = persona ? persona.nombre_completo : "este conductor";

            alert(`Atención: El chofer ${nombreChofer} ya fue registrado en un checklist el día de hoy.`);
            setIsProcessing(false);
            return; // Bloqueo total
          } else {
            console.log("No se encontró coincidencia exacta de ID de chofer en las respuestas de hoy.");
          }
        } else {
          console.log("No hay ningún formulario registrado hoy en la tabla formularios_hechos.");
        }

      } catch (e) {
        console.error("Error crítico en el candado:", e);
      }
    }
    // ==========================================
    // PASO 2: GUARDADO EN LA BASE DE DATOS
    // ==========================================
    try {
      setIsProcessing(true);
      const listaParaCorreo = [];

      let tablaDestino = "respuestas_operario";
      if (esLimpieza) tablaDestino = "respuestas_limpieza";
      if (!esOperario && !esLimpieza) tablaDestino = "respuesta";

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
        <h1 className="titulo-encuesta">{tituloDinamico}</h1>

        <div className="vendedor-badge">
          {badgeLabel} <strong>{nombreVendedor}</strong>
        </div>

        {preguntas.map((p, index) => {
          const esOperario = idEncuesta?.toLowerCase().includes("operario");
          const mapaOrdenActual = CONFIG_ENCUESTAS[tipoActual]?.orden || {};
          const numeroOrden = mapaOrdenActual[p.idpregunta];

          return (
            <div key={p.idpregunta}>
              {esOperario && numeroOrden === 1 && (
                <div className="seccion-titulo-container">
                  <h2 className="titulo-seccion-moderno">Tipo de documentación y seguridad</h2>
                  <hr className="separador-verde" />
                </div>
              )}

              {esOperario && numeroOrden === 8 && (
                <div className="seccion-titulo-container" style={{ marginTop: '40px' }}>
                  <h2 className="titulo-seccion-moderno">Revisión exterior</h2>
                  <hr className="separador-verde" />
                </div>
              )}

              <div className="cuestionario-card section-pregunta">
                <h3 className="pregunta-descripcion">{p.descripcion}</h3>

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
                      const mostrarInput = descripcionUpper.includes("REQUIERE ATENCIÓN") || descripcionUpper === "OTRO";

                      return mostrarInput ? (
                        <textarea
                          className="input-texto-moderno"
                          placeholder="Especifique el motivo o detalle..."
                          style={{ marginTop: '15px', height: '90px', padding: '12px', borderColor: '#1FB436', borderWidth: '2px', width: '100%', borderRadius: '8px', display: 'block' }}
                          value={observacionesExtra[p.idpregunta] || ""}
                          onChange={(e) => handleCambioObservacion(p.idpregunta, e.target.value)}
                        />
                      ) : null;
                    })()}
                  </>
                )}

                {p.tipopregunta === "foto" && (
                  <CuestionarioFoto onNext={(val) => handleCambioRespuesta(p.idpregunta, val)} />
                )}

                {p.tipopregunta === "firma" && (
                  <CuestionarioFirma onNext={(val) => handleCambioRespuesta(p.idpregunta, val)} />
                )}

                {p.tipopregunta === "multiple" && (
                  <CuestionarioMultiple 
                    opciones={opcionesMap[p.idpregunta] || []} 
                    currentValue={respuestasValues[p.idpregunta] || ""}
                    onChange={(val) => handleCambioRespuesta(p.idpregunta, val)}
                  />
                )}

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
                          <option key={c.id_personal} value={c.id_personal}>{c.nombre_completo}</option>
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
                          <option key={a.id_personal} value={a.id_personal}>{a.nombre_completo}</option>
                        ))}
                      </select>
                    ) : (p.descripcion.toLowerCase().includes("región") || p.descripcion.toLowerCase().includes("region")) ? (
                      <select 
                        className="input-texto-moderno"
                        value={respuestasValues[p.idpregunta] || ""}
                        onChange={(e) => {
                          setRegionActiva(e.target.value);
                          handleCambioRespuesta(p.idpregunta, e.target.value);
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
                          value={respuestasValues[p.idpregunta] !== undefined ? respuestasValues[p.idpregunta] : busquedaComuna}
                          disabled={!regionActiva}
                          onChange={(e) => {
                            setBusquedaComuna(e.target.value);
                            handleCambioRespuesta(p.idpregunta, e.target.value);
                          }}
                        />
                        {regionActiva && busquedaComuna && !preguntas.find(preg => preg.descripcion.toLowerCase().includes("comuna") && respuestasValues[preg.idpregunta] === busquedaComuna) && (
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