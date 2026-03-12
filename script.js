// Variables globales
let datosCargasRaw = [];
let datosExcelRaw = [];
let datosBonificacionesRaw = [];

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
 * Procesa fechas de Excel/Texto para que sean compatibles con el filtro de turno
 * Maneja el formato: "11/03/2026, 01:03:24"
 */
function parsearFechaUniversal(fechaInput) {
    if (fechaInput instanceof Date) return fechaInput;
    
    let str = fechaInput.toString().trim();
    // Quitamos la coma si existe para evitar conflictos
    str = str.replace(',', '');

    // Si detectamos formato DD/MM/YYYY
    if (str.includes('/')) {
        const partes = str.split(' ');
        const fechaPartes = partes[0].split('/');
        const dia = fechaPartes[0].padStart(2, '0');
        const mes = fechaPartes[1].padStart(2, '0');
        const anio = fechaPartes[2];
        const hora = partes[1] || "00:00:00";
        // Re-ensamblamos en formato ISO (YYYY-MM-DDTHH:mm:ss) para seguridad total
        return new Date(`${anio}-${mes}-${dia}T${hora}`);
    }
    
    return new Date(str);
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

        // Intentamos parsear la fecha del texto (asumiendo YYYY-MM-DD)
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

            if (nombre.toString().toUpperCase().trim() === "GROWING AGROPECUARIA S.A") return;

            if (monto > 0 && !isNaN(fechaObj.getTime())) {
                datosExcelRaw.push({ monto, nombre, fechaObj });
            }
        });
        aplicarFiltros();
    };
    reader.readAsArrayBuffer(file);
});

// --- 3. LÓGICA DE FILTRADO (TIEMPO REAL) ---
function aplicarFiltros() {
    const fMontoInput = document.getElementById('filtroMonto').value.trim();
    const fNombre = document.getElementById('filtroNombre').value.toLowerCase();
    
    const desdeVal = document.getElementById('turnoDesde').value;
    const hastaVal = document.getElementById('turnoHasta').value;
    const dateDesde = desdeVal ? new Date(desdeVal).getTime() : null;
    const dateHasta = hastaVal ? new Date(hastaVal).getTime() : null;

    const fMontoNum = fMontoInput !== "" ? Math.floor(normalizarMonto(fMontoInput)) : null;

    const filtrar = (lista, campoNombre) => lista.filter(item => {
        const montoMatch = fMontoNum === null || Math.floor(item.monto) === fMontoNum;
        const nombreMatch = fNombre === "" || item[campoNombre].toLowerCase().includes(fNombre);
        
        let turnoMatch = true;
        const itemTime = item.fechaObj.getTime();
        if (dateDesde && itemTime < dateDesde) turnoMatch = false;
        if (dateHasta && itemTime > dateHasta) turnoMatch = false;

        return montoMatch && nombreMatch && turnoMatch;
    });

    const cargasFiltradas = filtrar(datosCargasRaw, 'usuario');
    const bonosFiltrados = filtrar(datosBonificacionesRaw, 'usuario');
    const excelFiltrado = filtrar(datosExcelRaw, 'nombre');

    document.getElementById('countCargas').textContent = `${cargasFiltradas.length} / ${datosCargasRaw.length}`;
    document.getElementById('countExcel').textContent = `${excelFiltrado.length} / ${datosExcelRaw.length}`;
    document.getElementById('countBonos').textContent = `${bonosFiltrados.length} / ${datosBonificacionesRaw.length}`;

    renderizarCargas(cargasFiltradas, bonosFiltrados);
    renderizarExcel(excelFiltrado);
}

function renderizarCargas(cargas, bonos) {
    const vis = document.getElementById('resultadoCargas');
    vis.innerHTML = '';
    
    bonos.forEach(b => {
        vis.innerHTML += `
            <div class="text-yellow-500 italic border-b border-zinc-800 py-1 flex justify-between text-[10px]">
                <span>🎁 BONO: ${b.usuario}</span>
                <span class="font-bold">$${b.monto.toLocaleString('es-AR')}</span>
            </div>`;
    });
    cargas.forEach(c => {
        const h = c.fechaObj.getHours().toString().padStart(2, '0');
        const m = c.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `
            <div class="border-b border-zinc-800 py-1 flex justify-between text-[10px]">
                <span><span class="text-zinc-500">${h}:${m}</span> | ${c.usuario}</span>
                <span class="text-green-400 font-bold">$${c.monto.toLocaleString('es-AR')}</span>
            </div>`;
    });
}

function renderizarExcel(excel) {
    const vis = document.getElementById('resultadoExcel');
    vis.innerHTML = '';
    excel.forEach(e => {
        const h = e.fechaObj.getHours().toString().padStart(2, '0');
        const m = e.fechaObj.getMinutes().toString().padStart(2, '0');
        vis.innerHTML += `
            <div class="border-b border-zinc-800 py-1 flex justify-between text-[10px]">
                <span><span class="text-zinc-500">${h}:${m}</span> | <span class="text-zinc-400 truncate w-32 inline-block align-bottom">${e.nombre}</span></span>
                <span class="text-blue-400 font-bold">$${e.monto.toLocaleString('es-AR')}</span>
            </div>`;
    });
}

function limpiarFiltros() {
    document.getElementById('filtroMonto').value = "";
    document.getElementById('filtroNombre').value = "";
    document.getElementById('turnoDesde').value = "";
    document.getElementById('turnoHasta').value = "";
    aplicarFiltros();
}

// --- 4. CONCILIACIÓN FINAL ---
function conciliar() {
    const desdeVal = document.getElementById('turnoDesde').value;
    const hastaVal = document.getElementById('turnoHasta').value;
    const dD = desdeVal ? new Date(desdeVal).getTime() : null;
    const dH = hastaVal ? new Date(hastaVal).getTime() : null;

    const filtrarTurno = (lista) => lista.filter(i => {
        const t = i.fechaObj.getTime();
        return (!dD || t >= dD) && (!dH || t <= dH);
    });

    const cargasTurno = filtrarTurno(datosCargasRaw);
    const excelTurno = filtrarTurno(datosExcelRaw);

    const cuerpoTabla = document.getElementById('tablaComparativa');
    cuerpoTabla.innerHTML = '';

    const conteoCargas = {};
    const conteoExcel = {};

    cargasTurno.forEach(m => {
        let entero = Math.floor(m.monto); 
        conteoCargas[entero] = (conteoCargas[entero] || 0) + 1;
    });
    excelTurno.forEach(m => {
        let entero = Math.floor(m.monto);
        conteoExcel[entero] = (conteoExcel[entero] || 0) + 1;
    });

    const montosUnicos = [...new Set([...Object.keys(conteoCargas), ...Object.keys(conteoExcel)])];
    montosUnicos.sort((a, b) => b - a);

    montosUnicos.forEach(monto => {
        const cC = conteoCargas[monto] || 0;
        const cE = conteoExcel[monto] || 0;
        const coincide = cC === cE;

        const tr = document.createElement('tr');
        tr.className = coincide ? "bg-green-500/5" : "bg-red-500/5";
        tr.innerHTML = `
            <td class="p-3 border-b border-zinc-700 font-mono text-yellow-500 font-bold">$ ${parseInt(monto).toLocaleString('es-AR')}</td>
            <td class="p-3 border-b border-zinc-700 text-center font-bold text-lg">${cC}</td>
            <td class="p-3 border-b border-zinc-700 text-center font-bold text-lg">${cE}</td>
            <td class="p-3 border-b border-zinc-700 text-center font-bold text-[10px] uppercase">
                ${coincide ? '<span class="text-green-500">✅ OK</span>' : (cC > cE ? '<span class="text-red-500">❌ FALTA</span>' : '<span class="text-blue-400">⚠️ SOBRA</span>')}
            </td>
        `;
        cuerpoTabla.appendChild(tr);
    });

    // Actualizar Bonos en el panel inferior
    const listaBono = document.getElementById('listaBonificacionesIndependiente');
    listaBono.innerHTML = '';
    const bonosTurno = filtrarTurno(datosBonificacionesRaw);

    if (bonosTurno.length === 0) {
        listaBono.innerHTML = '<p class="text-zinc-600 text-xs italic py-4">Sin bonos en este rango.</p>';
    } else {
        bonosTurno.forEach(b => {
            listaBono.innerHTML += `
                <div class="bg-zinc-900 p-2 rounded border border-zinc-700 flex justify-between items-center text-xs">
                    <span class="text-blue-400 font-bold">${b.usuario}</span>
                    <span class="text-yellow-500 font-bold">$${b.monto.toLocaleString('es-AR')}</span>
                </div>`;
        });
    }
}