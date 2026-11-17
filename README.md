# Extractor de proformas (Movinsa)

Página web que lee proformas en PDF y extrae el **nombre del cliente**, el **número de chasis** y el **número de motor**. Los resultados se pueden revisar, corregir y descargar en Excel o CSV.

Todo ocurre en el navegador de quien la usa: los PDF no se suben a ningún servidor y no se usa ninguna API de pago.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página |
| `extractor.js` | Las reglas que buscan cliente, chasis y motor. Aquí se agregan etiquetas nuevas |
| `README.md` | Estas instrucciones |

## Publicarla con GitHub Pages

1. Entra a GitHub y crea un repositorio nuevo (por ejemplo `extractor-proformas`).
2. Pulsa **Add file → Upload files**, sube `index.html`, `extractor.js` y `README.md`, y pulsa **Commit changes**.
3. Ve a **Settings → Pages**.
4. En **Source** elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y pulsa **Save**.
5. En uno o dos minutos aparece la dirección, con la forma `https://USUARIO.github.io/extractor-proformas/`. Esa es la dirección que se comparte con los usuarios.

Para actualizar la página, sube de nuevo el archivo cambiado al repositorio; GitHub Pages se actualiza solo.

**Sobre la privacidad:** con un repositorio público, cualquiera con el enlace puede abrir la página, pero no puede ver las proformas de nadie, porque cada usuario las lee en su propia computadora. Si se quiere que solo personal de la empresa pueda abrir la página, GitHub Pages con repositorio privado requiere un plan de pago de GitHub (Team o Enterprise).

## Uso

1. Abrir la página.
2. Pulsar **Elegir archivos** o **Elegir carpeta**, o arrastrar los PDF.
3. Revisar la tabla:
   - Amarillo: dato no encontrado; se puede escribir a mano en la celda.
   - Rojo: chasis o motor repetido en otra fila.
   - **Texto** muestra lo que el programa leyó del PDF.
4. Pulsar **Descargar Excel**.

La tabla queda guardada en el navegador de cada usuario hasta que pulse **Vaciar tabla**. Las proformas que ya se leyeron se omiten si se vuelven a subir.

## Ajustar las reglas

Si un dato no sale, abrir la fila con **Texto**, ver con qué palabra aparece en la proforma (por ejemplo `Serial N.I.V.`) y agregarla al inicio de `extractor.js`, en la lista que corresponda:

```js
const ETIQUETAS_CHASIS = [
  "serial n.i.v.",   // <- nueva
  "serial de chasis",
  ...
];
```

No importan mayúsculas ni acentos. Luego se sube el `extractor.js` actualizado al repositorio.

## Limitaciones

- Solo PDF digitales (con texto seleccionable). Los escaneos o fotos no tienen texto que leer.
- La página necesita internet para cargar sus componentes (lector de PDF y generador de Excel), aunque los PDF nunca salen de la computadora.
