/**********************
 * VARIABLES FUENTE
 **********************/
let cargasSource = '';
let transferenciasSource = [];
let salientesSource = [];

/**********************
 * HELPERS
 **********************/
function limpiarMonto(v) {
  return v.replace(/[^\d]/g, '');
}

function normalizarMonto(num) {
  const entero = Math.floor(Number(num));
  return entero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function extraerMontoLinea(linea) {
  const m = linea.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/);
  return m ? m[0] : null;
}

function montoLineaACentavos(linea) {
  const m = extraerMontoLinea(linea);
  if (!m) return null;
  return Number(limpiarMonto(m));
}

function sumarMontos(lineas) {
  return lineas.reduce((acc, l) => {
    const v = montoLineaACentavos(l);
    return v ? acc + v : acc;
  }, 0) / 100;
}

/**********************
 * CARGAS MANUALES
 **********************/
cargasInput.addEventListener('input', () => {
  cargasSource = cargasInput.value;
});

/**********************
 * IMPORTAR XLSX (TRANSFERENCIAS ENTRANTES)
 **********************/
xlsxInput.addEventListener('change', e => {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = evt => {
    const wb = XLSX.read(evt.target.result, { type: 'binary' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    transferenciasSource = rows
      .filter(r => r[3] === 'Transferencia entrante' && Number(r[5]) > 0)
      .map(r => ({
        raw: `${r[0]}\tTransferencia\t${normalizarMonto(r[5])}`,
        fecha: new Date(r[0]),
        montoCentavos: Number(r[5]) * 100
      }));

    transferenciasInput.value =
      transferenciasSource.map(t => t.raw).join('\n');

    transferenciasPreview.innerText =
      `Transferencias importadas: ${transferenciasSource.length}`;

    transferenciasFiltradas.value = '';
    transferenciasCount.innerText = 'Transferencias filtradas: 0';
  };

  reader.readAsBinaryString(file);
});

/**********************
 * FILTRO TRANSFERENCIAS (MONTO + FECHA/HORA)
 **********************/
const fechaDesde = document.getElementById('fechaDesde');
const fechaHasta = document.getElementById('fechaHasta');

function filtrarTransferencias() {
  let resultado = [...transferenciasSource];

  // MONTO
  const montoBuscado = limpiarMonto(transferenciasFilter.value);
  if (montoBuscado) {
    const centavos = Number(montoBuscado) * 100;
    resultado = resultado.filter(t => t.montoCentavos === centavos);
  }

  // FECHA DESDE
  if (fechaDesde.value) {
    const desde = new Date(fechaDesde.value);
    resultado = resultado.filter(t => t.fecha >= desde);
  }

  // FECHA HASTA
  if (fechaHasta.value) {
    const hasta = new Date(fechaHasta.value);
    resultado = resultado.filter(t => t.fecha <= hasta);
  }

  transferenciasFiltradas.value =
    resultado.map(t => t.raw).join('\n');

  transferenciasCount.innerText =
    `Transferencias filtradas: ${resultado.length}`;
}

transferenciasFilter.addEventListener('input', filtrarTransferencias);
fechaDesde.addEventListener('change', filtrarTransferencias);
fechaHasta.addEventListener('change', filtrarTransferencias);

/**********************
 * FILTRO CARGAS (MONTO)
 **********************/
cargasFilter.addEventListener('input', () => {
  if (!cargasFilter.value) {
    cargasFiltradas.value = '';
    cargasCount.innerText = 'Cargas filtradas: 0';
    return;
  }

  const base = cargasSource.split('\n');
  const buscado = limpiarMonto(cargasFilter.value);
  const buscadoCentavos = Number(buscado) * 100;

  const resultado = base.filter(l =>
    montoLineaACentavos(l) === buscadoCentavos
  );

  cargasFiltradas.value = resultado.join('\n');
  cargasCount.innerText = `Cargas filtradas: ${resultado.length}`;
});

/**********************
 * COMPARAR
 **********************/
compararBtn.addEventListener('click', () => {
  okList.innerHTML = '';
  bonusList.innerHTML = '';
  errorList.innerHTML = '';

  const cargas = cargasSource
    .split('\n')
    .map(l => {
      const tipo = l.includes('Bonificacion') ? 'BONO' : 'CARGA';
      const monto = extraerMontoLinea(l);
      return monto ? { tipo, monto } : null;
    })
    .filter(Boolean);

  const agrupadas = {};

  cargas.forEach(c => {
    if (!agrupadas[c.monto]) {
      agrupadas[c.monto] = { carga: 0, bono: 0, trans: 0 };
    }
    if (c.tipo === 'BONO') agrupadas[c.monto].bono++;
    else agrupadas[c.monto].carga++;
  });

  transferenciasSource.forEach(t => {
    const m = extraerMontoLinea(t.raw);
    if (!m) return;
    if (!agrupadas[m]) {
      agrupadas[m] = { carga: 0, bono: 0, trans: 0 };
    }
    agrupadas[m].trans++;
  });

  Object.entries(agrupadas).forEach(([monto, d]) => {
    if (d.bono > 0) {
      bonusList.innerHTML += `
        <li class="text-yellow-400">
          🎁 ${d.bono} bonificación(es) de ${monto}
        </li>`;
    }

    if (d.carga === d.trans) {
      okList.innerHTML += `
        <li class="text-emerald-400">
          ✔ ${d.carga} carga(s) OK de ${monto}
        </li>`;
    } else if (d.carga > d.trans) {
      errorList.innerHTML += `
        <li class="text-red-400">
          ❌ Faltan ${d.carga - d.trans} transferencia(s) de ${monto}
        </li>`;
    } else {
      errorList.innerHTML += `
        <li class="text-red-400">
          ⚠ Sobran ${d.trans - d.carga} transferencia(s) de ${monto}
        </li>`;
    }
  });
});

/**********************
 * TRANSFERENCIAS SALIENTES (MODAL)
 **********************/
const CBU_EXCLUIDO = '000002334322884432';
const salientesFilter = document.getElementById('salientesFilter');

openSalientesBtn.addEventListener('click', () => {
  salientesModal.classList.remove('hidden');
  salientesModal.classList.add('flex');
});

closeSalientesBtn.addEventListener('click', () => {
  salientesModal.classList.add('hidden');
  salientesModal.classList.remove('flex');
});

/* IMPORTAR SALIENTES */
xlsxSalientesInput.addEventListener('change', e => {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = evt => {
    const wb = XLSX.read(evt.target.result, { type: 'binary' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    salientesSource = rows
      .filter(r =>
        r[3] === 'Transferencia saliente' &&
        Number(r[4]) > 0 &&
        !String(r[2] || '').includes(CBU_EXCLUIDO)
      )
      .map(r =>
        `${r[0]}\t${r[2]}\t${normalizarMonto(r[4])}`
      );

    salientesOutput.value = salientesSource.join('\n');
    const total = sumarMontos(salientesSource);

    salientesCount.innerText =
      `Transferencias: ${salientesSource.length} — Total: ${normalizarMonto(total)}`;
  };

  reader.readAsBinaryString(file);
});

/* FILTRO SALIENTES */
salientesFilter.addEventListener('input', () => {
  const buscado = limpiarMonto(salientesFilter.value);

  const base = !buscado
    ? salientesSource
    : salientesSource.filter(l =>
        montoLineaACentavos(l) === Number(buscado) * 100
      );

  salientesOutput.value = base.join('\n');
  const total = sumarMontos(base);

  salientesCount.innerText =
    `Transferencias: ${base.length} — Total: ${normalizarMonto(total)}`;
});







