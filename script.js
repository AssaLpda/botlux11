// Variables globales
let datosCargasRaw = [];
let datosExcelRaw = [];
let datosBonificacionesRaw = [];

/**
 * Base de datos de mapeo manual (Prioridad Máxima)
 * Agregado Daiana Magali Pacheco para asegurar el caso actual.
 */
const diccionarioNombres = {
    "a1magasalazar91": "Daiana Magali Pacheco",
    "z3mailen14": "Mailen Angelica Ceballo",
    "roxanatoledo2": "Nora Roxana Toledo"
};

/**
 * Normaliza montos (ej: "7.800,84" -> 7800.84)
 */
function normalizarMonto(valor) {
    if (!valor) return 0;
    let str = valor.toString().trim();
    str = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(str) || 0;
}

/**
 * Limpia nombres para comparación inteligente (quita tildes, números y espacios)
 */
function simplificarParaComparar(str) {
    if (!str) return "";
    return str.toString()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/[0-9]/g, '') 
        .replace(/\s+/g, '') 
        .trim();
}

/**
 * Procesa fechas de Excel/Texto
 */
function parsearFechaUniversal(fechaInput) {
    if (fechaInput instanceof Date) return fechaInput;
    let str = fechaInput.toString().trim().replace(',', '');
    if (str.includes('/')) {
        const partes = str.split(' ');
        const fechaPartes = partes[0].split('/');
        const dia = fechaPartes[0].padStart(2, '0');
        const mes = fechaPartes[1].padStart(2, '0');
        const anio = fechaPartes[2];
        const hora = partes[1] || "00:00:00";
        return new Date(`${anio}-${mes}-${dia}T${hora}`);
    }
    return new Date(str);
}

// --- FUNCIONES DEL MODAL ---
function cerrarModal() {
    document.getElementById('modalIdentidad').classList.add('hidden');
}

window.onclick = function(event) {
    const modal = document.getElementById('modalIdentidad');
    if (event.target == modal) cerrarModal();
}

// --- 1. PROCESAR TEXTO (PANEL IZQUIERDO) ---
document.getElementById('textoCargas').addEventListener('input', function(e) {
    const lineas = e.target.value.split('\n');
    datosCargasRaw = [];
    datosBonificacionesRaw = [];

    lineas.forEach(linea => {
        if (linea.trim() === '' || linea.length < 18) return;
        const fechaStr = linea.substring(0, 10);
        const horaStr = linea.substring(10, 18);
        const partes = linea.trim().split(/\s+/);
        const monto = normalizarMonto(partes[partes.length - 1]);
        const usuario = partes[1] || "Usuario";
        const fechaObj = new Date(`${fechaStr}T${horaStr}`);

        const item = { 
            fechaObj, 
            horaStr, 
            usuario, 
            monto, 
            esBonif: linea.toUpperCase().includes("BONIFICACION") 
        };
        
        if (item.esBonif) datosBonificacionesRaw.push(item);
        else datosCargasRaw.push(item);
    });
    aplicarFiltros();
});

// --- 2. PROCESAR EXCEL (PANEL DERECHO) ---
document.getElementById('inputExcel').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        datosExcelRaw = [];
        json.forEach(fila => {
            let keyMonto = Object.keys(fila).find(k => k.toLowerCase().includes('monto'));
            let keyNombre = Object.keys(fila).find(k => k.toLowerCase().includes('nombre') || k.toLowerCase().includes('remitente'));
            let keyFecha = Object.keys(fila).find(k => k.toLowerCase().includes('fecha'));
            let monto = keyMonto ? normalizarMonto(fila[keyMonto]) : 0;
            let nombre = fila[keyNombre] || "N/D";
            let fechaRaw = fila[keyFecha];
            if (!fechaRaw) return;
            let fechaObj = parsearFechaUniversal(fechaRaw);
            
            // Filtro de empresa propia
            if (nombre.toString().toUpperCase().trim().includes("GROWING")) return;
            
            if (monto > 0 && !isNaN(fechaObj.getTime())) {
                datosExcelRaw.push({ monto, nombre, fechaObj });
            }
        });
        aplicarFiltros();
    };
    reader.readAsArrayBuffer(file);
});

// --- 3. INVESTIGACIÓN POR FRAGMENTOS (SENSING) ---

function buscarPosiblesCulpables(montoFila) {
    const desdeVal = document.getElementById('turnoDesde').value;
    const hastaVal = document.getElementById('turnoHasta').value;
    const dD = desdeVal ? new Date(desdeVal).getTime() : null;
    const dH = hastaVal ? new Date(hastaVal).getTime() : null;

    const filtrarTurnoMonto = (lista) => lista.filter(i => {
        const t = i.fechaObj.getTime();
        const m = Math.floor(i.monto) === parseInt(montoFila);
        return m && (!dD || t >= dD) && (!dH || t <= dH);
    });

    const cargasMonto = filtrarTurnoMonto(datosCargasRaw);
    const excelMonto = filtrarTurnoMonto(datosExcelRaw);

    const cuerpo = document.getElementById('modalCuerpo');
    const subtitulo = document.getElementById('modalSubtitulo');

    subtitulo.textContent = `Analizando $${parseInt(montoFila).toLocaleString('es-AR')}`;
    cuerpo.innerHTML = ''; 

    cargasMonto.forEach(c => {
        const nickLimpio = simplificarParaComparar(c.usuario);
        const horaCarga = `${c.fechaObj.getHours().toString().padStart(2, '0')}:${c.fechaObj.getMinutes().toString().padStart(2, '0')}`;

        // Lógica de coincidencia por fragmentos
        const candidatos = excelMonto.map(e => {
            const nombreLimpio = simplificarParaComparar(e.nombre);
            let score = 0;
            let razon = "";

            // 1. Diccionario manual
            if (diccionarioNombres[c.usuario] === e.nombre) {
                score = 4; razon = "MANUAL";
            } 
            // 2. Coincidencia directa de texto
            else if (nickLimpio.length >= 4 && (nombreLimpio.includes(nickLimpio) || nickLimpio.includes(nombreLimpio))) {
                score = 3; razon = "NOMBRE";
            }
            // 3. Fragmentación (pedazos de 4 letras) -> Para casos como "maga"
            else {
                for (let i = 0; i <= nickLimpio.length - 4; i++) {
                    let fragmento = nickLimpio.substring(i, i + 4);
                    if (nombreLimpio.includes(fragmento)) {
                        score = 2; razon = "FRAGMENTO";
                        break;
                    }
                }
            }

            // 4. Proximidad de tiempo (margen 20 min)
            const diffMin = Math.abs(c.fechaObj - e.fechaObj) / 60000;
            if (score === 0 && diffMin <= 20) {
                score = 1; razon = "HORARIO";
            }

            return { ...e, score, razon, diffMin };
        }).filter(cand => cand.score > 0).sort((a, b) => b.score - a.score);

        let htmlCandidatos = '';
        candidatos.forEach(cand => {
            const hE = cand.fechaObj.getHours().toString().padStart(2, '0');
            const mE = cand.fechaObj.getMinutes().toString().padStart(2, '0');
            const color = cand.score >= 3 ? 'green' : (cand.score === 2 ? 'blue' : 'yellow');

            htmlCandidatos += `
                <div class="flex items-center gap-2 bg-${color}-500/5 border border-${color}-500/20 p-2 rounded-lg mb-1">
                    <div class="flex-1">
                        <p class="text-[11px] font-bold text-${color}-400 leading-tight">${cand.nombre}</p>
                        <p class="text-[8px] text-slate-500 uppercase font-black">
                            ${hE}:${mE} hs • <span class="opacity-70">${cand.razon}</span> 
                            ${cand.score === 1 ? `(${Math.round(cand.diffMin)}m dif)` : ''}
                        </p>
                    </div>
                </div>`;
        });

        cuerpo.innerHTML += `
            <div class="bg-slate-900/50 p-3 rounded-xl border border-slate-800 mb-3">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-[12px] font-black text-white uppercase">${c.usuario}</span>
                    <span class="text-[9px] font-mono text-slate-500 bg-slate-950 px-1 py-0.5 rounded">Carga: ${horaCarga}</span>
                </div>
                ${htmlCandidatos || '<p class="text-[9px] text-slate-600 italic p-2">Sin coincidencias.</p>'}
            </div>`;
    });

    document.getElementById('modalIdentidad').classList.remove('hidden');
}

// --- 4. FILTROS Y RENDERIZADO ---
function aplicarFiltros() {
    const fMontoInput = document.getElementById('filtroMonto').value.trim();
    const fNombre = simplificarParaComparar(document.getElementById('filtroNombre').value);
    const desdeVal = document.getElementById('turnoDesde').value;
    const hastaVal = document.getElementById('turnoHasta').value;
    const dD = desdeVal ? new Date(desdeVal).getTime() : null;
    const dH = hastaVal ? new Date(hastaVal).getTime() : null;
    const fMontoNum = fMontoInput !== "" ? Math.floor(normalizarMonto(fMontoInput)) : null;

    const filtrar = (lista, campo) => lista.filter(i => {
        const mMatch = fMontoNum === null || Math.floor(i.monto) === fMontoNum;
        const nMatch = fNombre === "" || simplificarParaComparar(i[campo]).includes(fNombre);
        const tMatch = (!dD || i.fechaObj.getTime() >= dD) && (!dH || i.fechaObj.getTime() <= dH);
        return mMatch && nMatch && tMatch;
    });

    renderizarCargas(filtrar(datosCargasRaw, 'usuario'), filtrar(datosBonificacionesRaw, 'usuario'));
    renderizarExcel(filtrar(datosExcelRaw, 'nombre'));
}

function renderizarCargas(c, b) {
    const vis = document.getElementById('resultadoCargas');
    vis.innerHTML = '';
    b.forEach(item => vis.innerHTML += `<div class="text-yellow-500 italic border-b border-zinc-800 py-1 flex justify-between text-[10px]"><span>🎁 ${item.usuario}</span><span class="font-bold">$${item.monto.toLocaleString('es-AR')}</span></div>`);
    c.forEach(item => {
        const h = item.fechaObj.getHours().toString().padStart(2, '0');
        const m = item.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `<div class="border-b border-zinc-800 py-1 flex justify-between text-[10px]"><span><span class="text-zinc-500">${h}:${m}</span> | ${item.usuario}</span><span class="text-green-400 font-bold">$${item.monto.toLocaleString('es-AR')}</span></div>`;
    });
}

function renderizarExcel(e) {
    const vis = document.getElementById('resultadoExcel');
    vis.innerHTML = '';
    e.forEach(item => {
        const h = item.fechaObj.getHours().toString().padStart(2, '0');
        const m = item.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `<div class="border-b border-zinc-800 py-1 flex justify-between text-[10px]"><span><span class="text-zinc-500">${h}:${m}</span> | <span class="truncate w-32 inline-block align-bottom">${item.nombre}</span></span><span class="text-blue-400 font-bold">$${item.monto.toLocaleString('es-AR')}</span></div>`;
    });
}

function conciliar() {
    const desdeVal = document.getElementById('turnoDesde').value;
    const hastaVal = document.getElementById('turnoHasta').value;
    const dD = desdeVal ? new Date(desdeVal).getTime() : null;
    const dH = hastaVal ? new Date(hastaVal).getTime() : null;
    const filtrar = (l) => l.filter(i => (!dD || i.fechaObj.getTime() >= dD) && (!dH || i.fechaObj.getTime() <= dH));

    const cT = filtrar(datosCargasRaw);
    const eT = filtrar(datosExcelRaw);
    const cuerpo = document.getElementById('tablaComparativa');
    cuerpo.innerHTML = '';

    const countC = {}; const countE = {};
    cT.forEach(i => { let m = Math.floor(i.monto); countC[m] = (countC[m] || 0) + 1; });
    eT.forEach(i => { let m = Math.floor(i.monto); countE[m] = (countE[m] || 0) + 1; });

    const montos = [...new Set([...Object.keys(countC), ...Object.keys(countE)])].sort((a, b) => b - a);

    montos.forEach(m => {
        const c = countC[m] || 0; const e = countE[m] || 0; const ok = c === e;
        const tr = document.createElement('tr');
        tr.className = `cursor-pointer transition-all ${ok ? "bg-green-500/5 hover:bg-green-500/10" : "bg-red-500/5 hover:bg-red-500/10"}`;
        tr.onclick = () => buscarPosiblesCulpables(m);
        tr.innerHTML = `<td class="p-3 border-b border-slate-800 font-mono text-violet-400 font-bold text-[13px]">$ ${parseInt(m).toLocaleString('es-AR')}</td>
            <td class="p-3 border-b border-slate-800 text-center font-bold text-slate-300">${c}</td>
            <td class="p-3 border-b border-slate-800 text-center font-bold text-slate-300">${e}</td>
            <td class="p-3 border-b border-slate-800 text-center font-black text-[9px] uppercase">${ok ? '<span class="text-green-500">✅ OK</span>' : (c > e ? '<span class="text-red-500">❌ FALTA</span>' : '<span class="text-blue-400">⚠️ SOBRA</span>')}</td>`;
        cuerpo.appendChild(tr);
    });
}

function ejecutarConciliacion() {
    const btn = document.getElementById('btnConciliar');
    const cargando = document.getElementById('btnCargando');
    btn.disabled = true; cargando.classList.remove('hidden');
    setTimeout(() => { conciliar(); btn.disabled = false; cargando.classList.add('hidden'); }, 600);
}

function limpiarFiltros() {
    document.getElementById('filtroMonto').value = "";
    document.getElementById('filtroNombre').value = "";
    document.getElementById('turnoDesde').value = "";
    document.getElementById('turnoHasta').value = "";
    aplicarFiltros();
}