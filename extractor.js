/*
 * Extractor de pólizas: reglas de búsqueda
 * ----------------------------------------
 * Aquí se define cómo se encuentran el asegurado, la póliza, el chasis y el motor.
 * Si cambia el formato o un dato aparece con otra palabra, basta con agregarla
 * a la lista correspondiente. No importan mayúsculas, acentos ni puntos.
 * Las listas van en orden de prioridad: se usa la primera etiqueta que aparezca.
 */
(function (global) {
  "use strict";

  const ETIQUETAS_CLIENTE = [
    "asegurado", "nombre del asegurado", "contratante", "tomador", "cliente",
    "nombre del cliente", "señor(es)", "razón social", "propietario", "a nombre de",
  ];

  const ETIQUETAS_POLIZA = [
    "póliza", "número de póliza", "certificado",
  ];

  const ETIQUETAS_CHASIS = [
    "chasis", "serial de chasis", "vin", "serial de carrocería", "serie",
  ];

  const ETIQUETAS_MOTOR = [
    "motor", "serial de motor",
  ];

  // Formato de las pólizas, por ejemplo 04-08-2228179-0.
  // Se usa si la etiqueta no aparece, y también se busca en el nombre del archivo.
  const FORMATO_POLIZA = /\b\d{2}-\d{2}-\d{5,9}-\d\b/;

  // Palabras que marcan el final del nombre del asegurado en la misma línea
  const CORTE_NOMBRE = [
    "ruc", "r.u.c", "cedula", "cédula", "c.i", "pasaporte", "telefono", "teléfono",
    "fecha", "direccion", "dirección", "correo", "email", "agencia", "factura",
  ];

  /* ===================== No hace falta tocar lo de abajo ===================== */

  const ACENTOS = { "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U",
                    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u" };
  const plano = s => s.replace(/[ÁÉÍÓÚÜáéíóúü]/g, c => ACENTOS[c]).toLowerCase(); // misma longitud
  const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // "No. de", "N°", "Nro.", "Número de" pueden ir antes o después de la etiqueta
  const NUM = "(?:n[°ºo]|nro|numero|num|no)\\.?";
  function patron(lista) {
    const partes = [...new Set(lista.map(plano))].sort((a, b) => b.length - a.length)
      .map(e => escapar(e).replace(/\\\./g, "\\.?").replace(/ +/g, "\\s*"));
    return new RegExp(
      "(?:^|[^a-z0-9])((?:" + NUM + "\\s*(?:de\\s*(?:la\\s*|el\\s*)?)?)?(?:" + partes.join("|") + ")(?![a-z0-9])" +
      "\\s*(?:" + NUM + "(?![a-z0-9]))?\\s*[:.#]?)", "g");
  }
  const RE = {
    cliente: ETIQUETAS_CLIENTE.map(e => patron([e])),   // por prioridad
    poliza: [patron(ETIQUETAS_POLIZA)],
    chasis: [patron(ETIQUETAS_CHASIS)],
    motor: [patron(ETIQUETAS_MOTOR)],
  };

  /* ---------- Filas de palabras con posición ---------- */
  // Cada fila: { top, h, words: [{t, x0, x1, top, h}] }, ordenadas de arriba abajo
  function agruparFilas(words) {
    words = words.filter(w => w.t && w.t.trim()).sort((a, b) => a.top - b.top || a.x0 - b.x0);
    const filas = [];
    for (const w of words) {
      const c = w.top + w.h / 2;
      const f = filas.find(F => Math.abs(F.c - c) <= Math.max(2, Math.min(F.h, w.h) * 0.55));
      if (f) { f.words.push(w); } else filas.push({ c, top: w.top, h: w.h, words: [w] });
    }
    for (const f of filas) {
      f.words.sort((a, b) => a.x0 - b.x0);
      f.h = f.words.reduce((m, w) => Math.max(m, w.h), 0);
      // Texto plano de la fila y posición de cada palabra dentro de él
      let txt = "";
      f.words.forEach(w => { if (txt) txt += " "; w.ini = txt.length; txt += w.t; w.fin = txt.length; });
      f.texto = txt;
      f.plano = plano(txt);
    }
    filas.sort((a, b) => a.c - b.c);
    return filas;
  }

  // Desde pdf.js (PDF con texto). Se usa por página; pageTop separa las páginas.
  function palabrasDePdf(items, pageTop) {
    const out = [];
    for (const it of items) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const h = Math.abs(it.transform[3]) || it.height || 10;
      const top = pageTop - it.transform[5] - h;
      const x = it.transform[4], cw = it.width / Math.max(1, it.str.length);
      const re = /\S+/g; let m;
      while ((m = re.exec(it.str))) {
        out.push({ t: m[0], x0: x + m.index * cw, x1: x + (m.index + m[0].length) * cw, top, h });
      }
    }
    return out;
  }

  // Desde el OCR (tesseract.js)
  function palabrasDeOcr(words, pageTop) {
    return words.map(w => ({ t: w.text, x0: w.bbox.x0, x1: w.bbox.x1, top: pageTop + w.bbox.y0, h: w.bbox.y1 - w.bbox.y0 }));
  }

  // Texto legible, con espacios grandes entre columnas (para mostrar en "Texto")
  function textoDeFilas(filas) {
    return filas.map(f => {
      let s = "", fin = null;
      for (const w of f.words) {
        if (fin !== null) s += (w.x0 - fin > f.h * 1.5) ? "   " : " ";
        s += w.t; fin = w.x1;
      }
      return s;
    }).join("\n");
  }

  /* ---------- Búsqueda de valores ---------- */
  const esEtiqueta = t => /:$/.test(t);
  function limpiarCodigo(t) { return t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").toUpperCase(); }
  function esCodigo(v) { return v.length >= 5 && v.length <= 30 && /\d/.test(v) && /^[A-Z0-9][A-Z0-9\-\/.]*$/.test(v); }

  // Todas las apariciones de una etiqueta: {fila, iPalabra (primera), jPalabra (siguiente a la etiqueta)}
  function apariciones(filas, re) {
    const out = [];
    filas.forEach((f, fi) => {
      re.lastIndex = 0; let m;
      while ((m = re.exec(f.plano))) {
        const ini = m.index + m[0].length - m[1].length, fin = m.index + m[0].length;
        const i = f.words.findIndex(w => w.fin > ini);
        let j = f.words.findIndex(w => w.ini >= fin);
        if (j < 0) j = f.words.length;
        // Si la etiqueta termina a mitad de palabra ("Motor:166FM"), esa palabra es el valor
        const partida = f.words.find(w => w.ini < fin && w.fin > fin);
        out.push({ fi, i, j, resto: partida ? partida.t.slice(fin - partida.ini) : "" });
      }
    });
    return out;
  }

  // Palabras de la misma fila después de la etiqueta, hasta otra etiqueta o un hueco grande
  function valorALaDerecha(f, a) {
    const vals = [];
    if (a.resto) vals.push(a.resto);
    let fin = a.j > 0 ? f.words[a.j - 1].x1 : null;
    for (let k = a.j; k < f.words.length; k++) {
      const w = f.words[k];
      if (fin !== null && vals.length && w.x0 - fin > f.h * 2.5) break;
      if (esEtiqueta(w.t) || (k + 1 < f.words.length && /^(no|n[°º]|nro)\.?:?$/i.test(f.words[k + 1].t) && esEtiqueta(f.words[k + 1].t))) break;
      vals.push(w.t); fin = w.x1;
    }
    return vals;
  }

  // Palabra de las filas de abajo alineada con el inicio de la etiqueta (formato en columnas)
  function valorDebajo(filas, a, valida) {
    const f = filas[a.fi], x = f.words[a.i].x0;
    for (let k = a.fi + 1; k < filas.length && k <= a.fi + 2; k++) {
      const g = filas[k];
      if (g.c - f.c > f.h * 4) break;
      const w = g.words.find(w => Math.abs(w.x0 - x) <= Math.max(f.h, g.h) * 1.3);
      if (w) { const v = valida(w.t); if (v) return v; }
    }
    return "";
  }

  function buscarCodigos(filas, re, arreglar) {
    const out = [];
    for (const a of apariciones(filas, re)) {
      const der = valorALaDerecha(filas[a.fi], a);
      const valida = t => { const v = arreglar(limpiarCodigo(t)); return esCodigo(v) ? v : ""; };
      const v = (der.length && valida(der[0])) || valorDebajo(filas, a, valida);
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }

  function cortarNombre(valor) {
    const base = plano(valor);
    let corte = valor.length;
    for (const p of CORTE_NOMBRE) {
      const m = new RegExp("(^|\\s)" + escapar(plano(p)) + "(?![a-z])").exec(base);
      if (m && m.index > 0) corte = Math.min(corte, m.index);
    }
    let v = valor.slice(0, corte).trim();
    // Quita la cédula o RUC del inicio: "4-827-13 CESAR..." -> "CESAR..."
    v = v.replace(/^(?:[A-Z]{0,3}-?\d[\w-]*\s+)+/i, "");
    return v.replace(/^[\s:\-,]+|[\s:\-,]+$/g, "");
  }

  function buscarCliente(filas) {
    for (const re of RE.cliente) {
      for (const a of apariciones(filas, re)) {
        let partes = valorALaDerecha(filas[a.fi], a);
        if (!partes.length) {
          const f = filas[a.fi], g = filas[a.fi + 1];
          if (g && g.c - f.c < f.h * 3) partes = g.words.filter(w => w.x0 >= f.words[a.i].x0 - f.h).map(w => w.t);
        }
        const v = cortarNombre(partes.join(" "));
        if (v.length >= 3 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(v)) return v;
      }
    }
    return "";
  }

  // El VIN nunca lleva I, O ni Q: si el OCR las leyó, son 1, 0 y 0
  const arreglarVin = v => v.length === 17 ? v.replace(/O/g, "0").replace(/Q/g, "0").replace(/I/g, "1") : v;

  /* Devuelve una fila por vehículo: {cliente, poliza, chasis, motor, nota} */
  function extraer(filas, nombreArchivo) {
    const texto = filas.map(f => f.texto).join("\n");
    const notas = [];
    let cliente = buscarCliente(filas);
    // El OCR a veces pierde la Ñ: si el nombre del archivo trae la palabra con Ñ, se usa esa
    const delArchivo = (nombreArchivo || "").replace(/\.[a-z0-9]+$/i, "").split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).filter(Boolean);
    if (cliente && delArchivo.length) {
      const sinN = t => plano(t).replace(/ñ/g, "n");
      cliente = cliente.split(" ").map(p => {
        const igual = delArchivo.find(a => /ñ/i.test(a) && sinN(a) === sinN(p));
        return igual ? (p === p.toUpperCase() ? igual.toUpperCase() : igual) : p;
      }).join(" ");
    }

    let polizas = buscarCodigos(filas, RE.poliza[0], v => v).filter(p => FORMATO_POLIZA.test(p) || /\d{4,}/.test(p));
    if (!polizas.length) {
      const m = texto.match(FORMATO_POLIZA);
      if (m) { polizas = [m[0]]; notas.push("Póliza tomada por formato"); }
    }
    const enNombre = (nombreArchivo || "").match(FORMATO_POLIZA);
    if (!polizas.length && enNombre) { polizas = [enNombre[0]]; notas.push("Póliza tomada del nombre del archivo"); }
    else if (enNombre && polizas[0] && polizas[0] !== enNombre[0]) notas.push("La póliza no coincide con el nombre del archivo");

    let chasis = buscarCodigos(filas, RE.chasis[0], arreglarVin);
    if (!chasis.length) {
      const vins = (texto.toUpperCase().match(/\b[A-Z0-9]{17}\b/g) || [])
        .map(arreglarVin).filter(v => /\d/.test(v) && /[A-Z]/.test(v) && !/[IOQ]/.test(v));
      chasis = [...new Set(vins)];
      if (chasis.length) notas.push("Chasis tomado por formato VIN");
    }
    const motores = buscarCodigos(filas, RE.motor[0], v => v).filter(m => !chasis.includes(m) && !polizas.includes(m));

    const n = Math.max(chasis.length, motores.length, 1);
    if (n > 1) notas.push(n + " vehículos en el documento");
    if (chasis.length && motores.length && chasis.length !== motores.length) notas.push("Distinta cantidad de chasis y motores: revisar");

    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ cliente, poliza: polizas.length === n ? polizas[i] : (polizas[0] || ""),
                 chasis: chasis[i] || "", motor: motores[i] || "", nota: notas.join("; ") });
    }
    return out;
  }

  const completo = r => r.every(x => x.cliente && x.poliza && x.chasis && x.motor);

  const api = { agruparFilas, palabrasDePdf, palabrasDeOcr, textoDeFilas, extraer, completo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Extractor = api;
})(this);
