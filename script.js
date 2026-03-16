// --- VARIABLES GLOBALES ---
let datosCargasRaw = [];
let datosExcelRaw = [];
let datosBonificacionesRaw = [];

const diccionarioNombres = {
    "a1magasalazar91": "Daiana Magali Pacheco",
    "z3mailen14": "Mailen Angelica Ceballo",
    "roxanatoledo2": "Nora Roxana Toledo"
};

// --- UTILIDADES ---
function normalizarMonto(valor) {
    if (!valor) return 0;
    let str = valor.toString().trim();
    str = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(str) || 0;
}

function simplificarParaComparar(str) {
    if (!str) return "";
    return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[0-9]/g, '').replace(/\s+/g, '').trim();
}

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

// --- MODAL ---
function cerrarModal() {
    document.getElementById('modalIdentidad').classList.add('hidden');
}
window.onclick = function(event) {
    const modal = document.getElementById('modalIdentidad');
    if (event.target == modal) cerrarModal();
}

// --- 1. PROCESAR TEXTO (CARGAS) ---
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

        const item = { fechaObj, horaStr, usuario, monto, esBonif: linea.toUpperCase().includes("BONIFICACION") };
        
        if (item.esBonif) datosBonificacionesRaw.push(item);
        else datosCargasRaw.push(item);
    });
    aplicarFiltros();
});

// --- 2. PROCESAR EXCEL ---
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
            if (!fechaRaw || nombre.toString().toUpperCase().trim().includes("GROWING")) return;
            let fechaObj = parsearFechaUniversal(fechaRaw);
            if (monto > 0 && !isNaN(fechaObj.getTime())) {
                datosExcelRaw.push({ monto, nombre, fechaObj });
            }
        });
        aplicarFiltros();
    };
    reader.readAsArrayBuffer(file);
});

// --- 3. FILTROS Y CONTADORES ---
function aplicarFiltros() {
    // Filtros Generales (Turno y Nombre)
    const fNombre = simplificarParaComparar(document.getElementById('filtroNombre').value);
    const dD = document.getElementById('turnoDesde').value ? new Date(document.getElementById('turnoDesde').value).getTime() : null;
    const dH = document.getElementById('turnoHasta').value ? new Date(document.getElementById('turnoHasta').value).getTime() : null;
    
    // Filtro de Monto General (el de arriba)
    const fMontoGralInput = document.getElementById('filtroMonto').value.trim();
    const fMontoGral = fMontoGralInput !== "" ? Math.floor(normalizarMonto(fMontoGralInput)) : null;

    // Filtros de Monto Específicos (los nuevos)
    const fMontoCargasInput = document.getElementById('filtroInternoCargas').value.trim();
    const fMontoCargas = fMontoCargasInput !== "" ? Math.floor(normalizarMonto(fMontoCargasInput)) : null;

    const fMontoExcelInput = document.getElementById('filtroInternoExcel').value.trim();
    const fMontoExcel = fMontoExcelInput !== "" ? Math.floor(normalizarMonto(fMontoExcelInput)) : null;

    // Función de filtrado lógica
    const filtrar = (lista, campo, montoEspecifico) => lista.filter(i => {
        // Si hay monto general, usa ese. Si no, usa el específico de su columna.
        const montoABuscar = fMontoGral !== null ? fMontoGral : montoEspecifico;
        
        const mMatch = montoABuscar === null || Math.floor(i.monto) === montoABuscar;
        const nMatch = fNombre === "" || simplificarParaComparar(i[campo]).includes(fNombre);
        const tMatch = (!dD || i.fechaObj.getTime() >= dD) && (!dH || i.fechaObj.getTime() <= dH);
        
        return mMatch && nMatch && tMatch;
    });

    const cargasFiltradas = filtrar(datosCargasRaw, 'usuario', fMontoCargas);
    const bonosFiltrados = filtrar(datosBonificacionesRaw, 'usuario', fMontoCargas);
    const excelFiltrado = filtrar(datosExcelRaw, 'nombre', fMontoExcel);

    // Actualizar contadores
    document.getElementById('countCargas').textContent = `${cargasFiltradas.length} / ${datosCargasRaw.length}`;
    document.getElementById('countBonos').textContent = `${bonosFiltrados.length} / ${datosBonificacionesRaw.length}`;
    document.getElementById('countExcel').textContent = `${excelFiltrado.length} / ${datosExcelRaw.length}`;

    renderizarCargas(cargasFiltradas, bonosFiltrados);
    renderizarExcel(excelFiltrado);
}

// --- 4. RENDERIZADO ---
function renderizarCargas(c, b) {
    const vis = document.getElementById('resultadoCargas');
    const listaBonos = document.getElementById('listaBonificacionesIndependiente');
    vis.innerHTML = '';
    listaBonos.innerHTML = '';

    if (b.length === 0) listaBonos.innerHTML = '<p class="text-slate-600 text-xs italic">No se han detectado bonos.</p>';

    b.forEach(item => {
        const html = `<div class="bg-slate-800/40 border border-amber-500/20 p-3 rounded-xl flex justify-between items-center">
            <span class="text-xs font-bold text-slate-300">🎁 ${item.usuario}</span>
            <span class="text-amber-500 font-mono font-black">$${item.monto.toLocaleString('es-AR')}</span>
        </div>`;
        listaBonos.innerHTML += html;
        vis.innerHTML += `<div class="text-amber-500 italic border-b border-slate-800 py-1 flex justify-between text-[11px]"><span>🎁 ${item.usuario}</span><span>$${item.monto.toLocaleString('es-AR')}</span></div>`;
    });

    c.forEach(item => {
        const h = item.fechaObj.getHours().toString().padStart(2, '0');
        const m = item.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `<div class="border-b border-slate-800 py-1 flex justify-between text-[11px] items-center">
            <span class="text-slate-300"><span class="text-slate-600 font-mono text-[9px] mr-1">${h}:${m}</span> ${item.usuario}</span>
            <span class="text-green-400 font-bold">$${item.monto.toLocaleString('es-AR')}</span>
        </div>`;
    });
}

function renderizarExcel(e) {
    const vis = document.getElementById('resultadoExcel');
    vis.innerHTML = '';
    e.forEach(item => {
        const h = item.fechaObj.getHours().toString().padStart(2, '0');
        const m = item.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `<div class="border-b border-slate-800 py-1 flex justify-between text-[11px] items-center">
            <span class="text-slate-300"><span class="text-slate-600 font-mono text-[9px] mr-1">${h}:${m}</span> <span class="truncate w-32 inline-block align-bottom">${item.nombre}</span></span>
            <span class="text-cyan-400 font-bold">$${item.monto.toLocaleString('es-AR')}</span>
        </div>`;
    });
}

// --- 5. CONCILIACIÓN Y MODAL ---
function buscarPosiblesCulpables(montoFila) {
    const dD = document.getElementById('turnoDesde').value ? new Date(document.getElementById('turnoDesde').value).getTime() : null;
    const dH = document.getElementById('turnoHasta').value ? new Date(document.getElementById('turnoHasta').value).getTime() : null;

    const filtrarTurnoMonto = (lista) => lista.filter(i => {
        const t = i.fechaObj.getTime();
        return Math.floor(i.monto) === parseInt(montoFila) && (!dD || t >= dD) && (!dH || t <= dH);
    });

    const cargasMonto = filtrarTurnoMonto(datosCargasRaw);
    const excelMonto = filtrarTurnoMonto(datosExcelRaw);
    const cuerpo = document.getElementById('modalCuerpo');
    document.getElementById('modalSubtitulo').textContent = `Importe: $${parseInt(montoFila).toLocaleString('es-AR')}`;
    cuerpo.innerHTML = ''; 

    cargasMonto.forEach(c => {
        const nickLimpio = simplificarParaComparar(c.usuario);
        const horaCarga = `${c.fechaObj.getHours().toString().padStart(2, '0')}:${c.fechaObj.getMinutes().toString().padStart(2, '0')}`;
        
        const candidatos = excelMonto.map(e => {
            const nombreLimpio = simplificarParaComparar(e.nombre);
            let score = 0; let razon = "";
            if (diccionarioNombres[c.usuario] === e.nombre) { score = 4; razon = "MANUAL"; } 
            else if (nickLimpio.length >= 4 && (nombreLimpio.includes(nickLimpio) || nickLimpio.includes(nombreLimpio))) { score = 3; razon = "NOMBRE"; }
            else {
                for (let i = 0; i <= nickLimpio.length - 4; i++) {
                    if (nombreLimpio.includes(nickLimpio.substring(i, i + 4))) { score = 2; razon = "FRAGMENTO"; break; }
                }
            }
            const diffMin = Math.abs(c.fechaObj - e.fechaObj) / 60000;
            if (score === 0 && diffMin <= 25) { score = 1; razon = "HORARIO"; }
            return { ...e, score, razon, diffMin };
        }).filter(cand => cand.score > 0).sort((a, b) => b.score - a.score);

        let htmlCandidatos = '';
        candidatos.forEach(cand => {
            const hE = cand.fechaObj.getHours().toString().padStart(2, '0');
            const mE = cand.fechaObj.getMinutes().toString().padStart(2, '0');
            const color = cand.score >= 3 ? 'green' : (cand.score === 2 ? 'cyan' : 'amber');
            htmlCandidatos += `<div class="flex items-center gap-2 bg-${color}-500/5 border border-${color}-500/20 p-2 rounded-lg mb-1">
                <div class="flex-1">
                    <p class="text-[11px] font-bold text-${color}-400">${cand.nombre}</p>
                    <p class="text-[8px] text-slate-500 uppercase font-black">${hE}:${mE} hs • ${cand.razon}</p>
                </div>
            </div>`;
        });

        cuerpo.innerHTML += `<div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700 mb-3">
            <div class="flex justify-between items-center mb-2">
                <span class="text-[12px] font-black text-white uppercase">${c.usuario}</span>
                <span class="text-[9px] font-mono text-slate-500 bg-black px-1 py-0.5 rounded">Hora Carga: ${horaCarga}</span>
            </div>
            ${htmlCandidatos || '<p class="text-[9px] text-slate-600 italic p-2">Sin sugerencias cercanas.</p>'}
        </div>`;
    });
    document.getElementById('modalIdentidad').classList.remove('hidden');
}

function conciliar() {
    const dD = document.getElementById('turnoDesde').value ? new Date(document.getElementById('turnoDesde').value).getTime() : null;
    const dH = document.getElementById('turnoHasta').value ? new Date(document.getElementById('turnoHasta').value).getTime() : null;
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
        // Busca esta parte en tu función conciliar():
tr.innerHTML = `
    <td class="p-3 border-b border-slate-700/30 font-mono text-violet-400 font-bold text-[12px]">$ ${parseInt(m).toLocaleString('es-AR')}</td>
    <td class="p-3 border-b border-slate-700/30 text-center font-bold text-slate-300 text-[12px]">${c}</td>
    <td class="p-3 border-b border-slate-700/30 text-center font-bold text-slate-300 text-[12px]">${e}</td>
    <td class="p-3 border-b border-slate-700/30 text-right pr-6 font-black text-[9px] uppercase">
        ${ok ? '<span class="text-green-500">✅ OK</span>' : (c > e ? '<span class="text-red-500">❌ FALTA</span>' : '<span class="text-cyan-400">⚠️ SOBRA</span>')}
    </td>`;
        cuerpo.appendChild(tr);
    });
}

function ejecutarConciliacion() {
    const btn = document.getElementById('btnConciliar');
    const cargando = document.getElementById('btnCargando');
    const texto = document.getElementById('btnTexto');
    btn.disabled = true; 
    cargando.classList.remove('hidden');
    texto.classList.add('opacity-0');
    setTimeout(() => { 
        conciliar(); 
        btn.disabled = false; 
        cargando.classList.add('hidden'); 
        texto.classList.remove('opacity-0');
    }, 600);
}

function limpiarFiltros() {
    document.getElementById('filtroMonto').value = "";
    document.getElementById('filtroNombre').value = "";
    document.getElementById('turnoDesde').value = "";
    document.getElementById('turnoHasta').value = "";
    aplicarFiltros();
}