/* Gerador mínimo de .docx (ZIP "store" + WordprocessingML). Sem dependências; funciona no navegador e no Node. */
(function (root) {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = s => new TextEncoder().encode(s);

  function zipStore(files) { // files: [{name, data: Uint8Array}]
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = []; let offset = 0;
    files.forEach(f => {
      const name = enc(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      parts.push(new Uint8Array(h.buffer), name, f.data); central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + f.data.length;
    });
    const cdSize = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(offset + cdSize + 22); let p = 0;
    all.forEach(x => { out.set(x, p); p += x.length; });
    return out;
  }

  const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const run = (t, o = {}) => String(t).split('\n').map((line, i) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 22}"/></w:rPr>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join('');
  const para = (inner, o = {}) => `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 120}"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="${o.hang || 0}"/>` : ''}${o.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${inner}</w:p>`;

  // blocks: {type:'title'|'meta'|'h'|'p'|'li'|'verse'|'label', ...}
  function blockXml(b) {
    switch (b.type) {
      case 'title': return para(run(b.text, { b: 1, sz: 40, color: '1F3A5F' }), { after: 80 });
      case 'meta': return para(run(b.text, { i: 1, sz: 20, color: '666666' }), { after: 240 });
      case 'h': return para(run(b.text, { b: 1, sz: b.level === 1 ? 30 : 26, color: '1F3A5F' }), { before: 240, after: 100, keep: 1 });
      case 'p': return para(run(b.text, { b: b.b, i: b.i, sz: b.sz }));
      case 'li': return para(run('•  ' + b.text), { ind: 540, hang: 270, after: 60 });
      case 'verse': return para(run(b.ref + ' ', { b: 1, sz: 21 }) + run(b.text, { i: 1, sz: 21 }), { ind: 400 });
      case 'label': return para(run(b.label + ': ', { b: 1 }) + run(b.text));
      default: return '';
    }
  }
  function makeDocx(blocks) {
    const body = blocks.map(blockXml).join('');
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return zipStore([
      { name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
      { name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: 'word/document.xml', data: enc(document) }
    ]);
  }
  function makeMarkdown(blocks) {
    return blocks.map(b => ({
      title: `# ${b.text}\n`, meta: `*${b.text}*\n`, h: `${b.level === 1 ? '##' : '###'} ${b.text}\n`, p: b.b ? `**${b.text}**\n` : b.i ? `*${b.text}*\n` : `${b.text}\n`,
      li: `- ${b.text}`, verse: `> **${b.ref}** ${b.text}\n`, label: `**${b.label}:** ${b.text}\n`
    }[b.type] || '')).join('\n');
  }
  const api = { makeDocx, makeMarkdown, zipStore, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DocxLib = api;
})(typeof self !== 'undefined' ? self : this);
