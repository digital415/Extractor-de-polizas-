/*
 * Extractor de proformas: reglas de búsqueda
 * -------------------------------------------
 * Aquí se define cómo se encuentran el cliente, el chasis y el motor.
 * Si las proformas cambian de formato o usan otra palabra para un dato,
 * basta con agregarla a la lista correspondiente. No importan mayúsculas ni acentos.
 */
(function (global) {
  "use strict";

  const ETIQUETAS_CLIENTE = [
    "cliente", "nombre del cliente", "señor(es)", "señores", "señor", "sr(es)",
    "razon social", "razón social", "nombre o razon social", "nombre o razón social",
    "comprador", "facturar a", "a nombre de", "nombre",
  ];

  const ETIQUETAS_CHASIS = [
    "serial de chasis", "serial chasis", "numero de chasis", "número de chasis",
    "nro de chasis", "nro. de chasis", "n° de chasis", "no. de chasis", "chasis",
    "serial de carroceria", "serial de carrocería", "serial carroceria",
    "vin", "n° de serie", "numero de serie", "número de serie", "serie",
  ];

  const ETIQUETAS_MOTOR = [
    "serial de motor", "serial motor", "numero de motor", "número de motor",
    "nro de motor", "nro. de motor", "n° de motor", "no. de motor", "motor",
  ];

  const ETIQUETAS_POLIZA = [
    "poliza", "póliza", "numero de poliza", "número de póliza", "nro de poliza",
    "nro. de poliza", "n° de poliza", "n° de póliza", "no. de poliza",
  ];

  // Formato de respaldo si la póliza aparece sin etiqueta, por ejemplo 04-08-2228179-0
  const FORMATO_POLIZA = /\b\d{2}-\d{2}-\d{5,9}-\d\b/g;

  // Palabras que marcan el final del nombre del cliente en la misma línea
  // (por ejemplo: "Cliente: JUAN PÉREZ   RIF: V-12345678")
  const CORTE_NOMBRE = [
    "rif", "r.i.f", "c.i", "ci:", "cedula", "cédula", "nit", "ruc", "dni", "cuit",
    "telefono", "teléfono", "tlf", "tel:", "fecha", "direccion", "dirección",
    "correo", "email", "e-mail", "vendedor", "proforma", "n°", "nro",
  ];

  /* ===================== No hace falta tocar lo de abajo ===================== */

  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;                // VIN: 17 caracteres, sin I, O ni Q
  const CODIGO = "([A-Z0-9][A-Z0-9\\-\\/\\.]{3,24}[A-Z0-9])"; // serial de 5 a 26 caracteres
  const SEP = "\\s*(?:N[°ºo]\\.?|NRO\\.?|NO\\.?|#)?\\s*[:\\.\\-]?\\s*";

  const ACENTOS = { "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U",
                    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u" };
  // Cambia letra por letra, así las posiciones del texto no se mueven
  const quitarAcentos = s => s.replace(/[ÁÉÍÓÚÜáéíóúü]/g, c => ACENTOS[c]);
  const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function patron(etiquetas) {
    const unicas = [...new Set(etiquetas.map(e => quitarAcentos(e.toLowerCase())))];
    unicas.sort((a, b) => b.length - a.length); // gana la etiqueta más específica
    return "(?:" + unicas.map(escapar).join("|") + ")";
  }
  const ET_CLIENTE = patron(ETIQUETAS_CLIENTE);
  const ET_CHASIS = patron(ETIQUETAS_CHASIS);
  const ET_MOTOR = patron(ETIQUETAS_MOTOR);
  const ET_POLIZA = patron(ETIQUETAS_POLIZA);

  function buscarCodigos(texto, etiqueta) {
    const t = quitarAcentos(texto);
    const re = new RegExp("\\b" + etiqueta + "(?![a-z0-9])" + SEP + "(?:\\n\\s*)?" + CODIGO, "gi");
    const out = [];
    let m;
    while ((m = re.exec(t))) {
      const v = m[1].toUpperCase().replace(/^[.\-\/]+|[.\-\/]+$/g, "");
      if (/\d/.test(v) && !out.includes(v)) out.push(v);
    }
    return out;
  }

  function cortarNombre(valor) {
    const base = quitarAcentos(valor.toLowerCase());
    let corte = valor.length;
    for (const palabra of CORTE_NOMBRE) {
      const m = new RegExp("(^|\\s)" + escapar(quitarAcentos(palabra.toLowerCase()))).exec(base);
      if (m && m.index > 0) corte = Math.min(corte, m.index);
    }
    const g = /\s{3,}/.exec(valor); // un espacio grande suele separar columnas
    if (g) corte = Math.min(corte, g.index);
    return valor.slice(0, corte).replace(/^[\s:\-,]+|[\s:\-,]+$/g, "");
  }

  function buscarCliente(texto) {
    const lineas = texto.split("\n");
    const inicio = new RegExp("^\\s*" + ET_CLIENTE + "(?![a-z0-9])\\s*[:.\\-]?\\s*(.*)$", "i");
    const enLinea = new RegExp("\\b" + ET_CLIENTE + "\\s*:\\s*(.*)$", "i");
    for (let i = 0; i < lineas.length; i++) {
      const l = quitarAcentos(lineas[i]);
      const m = inicio.exec(l) || enLinea.exec(l);
      if (!m) continue;
      const desde = m.index + m[0].length - m[1].length;
      let valor = lineas[i].slice(desde).trim();
      if (!valor && i + 1 < lineas.length) valor = lineas[i + 1].trim(); // nombre en la línea siguiente
      valor = cortarNombre(valor);
      if (valor.length >= 3 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(valor)) return valor;
    }
    return "";
  }

  /* Devuelve una fila por vehículo: {cliente, poliza, chasis, motor, nota} */
  function extraer(texto) {
    if (texto.replace(/\s/g, "").length < 30) {
      return [{ cliente: "", poliza: "", chasis: "", motor: "", nota: "El PDF no tiene texto (¿es un escaneo?)" }];
    }
    const notas = [];
    const cliente = buscarCliente(texto);

    let chasis = buscarCodigos(texto, ET_CHASIS);
    if (!chasis.length) {
      const vins = (texto.toUpperCase().match(VIN_RE) || []).filter(v => /\d/.test(v) && /[A-Z]/.test(v));
      chasis = [...new Set(vins)];
      if (chasis.length) notas.push("Chasis tomado por formato VIN");
    }
    const motores = buscarCodigos(texto, ET_MOTOR).filter(m => !chasis.includes(m));

    let polizas = buscarCodigos(texto, ET_POLIZA).filter(p => !chasis.includes(p) && !motores.includes(p));
    if (!polizas.length) {
      polizas = [...new Set(texto.match(FORMATO_POLIZA) || [])];
      if (polizas.length) notas.push("Póliza tomada por formato");
    }

    const n = Math.max(chasis.length, motores.length, 1);
    if (n > 1) notas.push(n + " vehículos en la proforma");
    if (chasis.length && motores.length && chasis.length !== motores.length)
      notas.push("Distinta cantidad de chasis y motores: revisar");

    const filas = [];
    for (let i = 0; i < n; i++) {
      // Si hay una póliza por vehículo se emparejan; si no, todas las filas llevan la primera
      const poliza = polizas.length === n ? polizas[i] : (polizas[0] || "");
      filas.push({ cliente, poliza, chasis: chasis[i] || "", motor: motores[i] || "", nota: notas.join("; ") });
    }
    return filas;
  }

  /* Convierte el PDF en texto, línea por línea, respetando el orden visual */
  async function leerTextoPDF(pdfjs, data) {
    const pdf = await pdfjs.getDocument({ data }).promise;
    const paginas = [];
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const { items } = await page.getTextContent();
        const piezas = items
          .filter(it => typeof it.str === "string" && it.str.length)
          .map(it => ({
            s: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
            h: Math.abs(it.transform[3]) || it.height || 10,
          }))
          .sort((a, b) => b.y - a.y || a.x - b.x);
        const lineas = [];
        for (const pz of piezas) {
          const l = lineas.find(L => Math.abs(L.y - pz.y) <= Math.max(2, pz.h * 0.5));
          if (l) l.items.push(pz); else lineas.push({ y: pz.y, items: [pz] });
        }
        lineas.sort((a, b) => b.y - a.y);
        const texto = lineas.map(L => {
          L.items.sort((a, b) => a.x - b.x);
          let out = "", fin = null;
          for (const it of L.items) {
            // pdf.js representa los huecos entre textos como piezas de solo espacios
            if (!it.s.trim()) {
              if (it.w > it.h * 1.5) { out = out.replace(/\s+$/, "") + "   "; }
              else if (!out.endsWith(" ")) out += " ";
              fin = it.x + it.w;
              continue;
            }
            if (fin !== null) {
              const hueco = it.x - fin;
              if (hueco > it.h * 1.5) out += "   ";          // columna distinta
              else if (hueco > it.h * 0.15 && !out.endsWith(" ") && !it.s.startsWith(" ")) out += " ";
            }
            out += it.s;
            fin = it.x + it.w;
          }
          return out.replace(/\s+$/, "");
        }).join("\n");
        paginas.push(texto);
        page.cleanup();
      }
    } finally {
      pdf.destroy();
    }
    return paginas.join("\n");
  }

  const api = { extraer, leerTextoPDF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Extractor = api;
})(this);
