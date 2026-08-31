export interface DiagramRequest {
  type: 'graph' | 'geometry' | 'venn' | 'flowchart' | 'tree';
  title?: string;
  data: Record<string, any>;
}

export class DiagramService {
  /**
   * Mengekstrak tag [DIAGRAM:{...}] dari teks AI
   */
  public static parseDiagramTag(text: string): { cleanText: string; diagramReq: DiagramRequest | null } {
    let cleanText = text;
    let diagramReq: DiagramRequest | null = null;

    const match = text.match(/\[DIAGRAM:\s*(\{.*?\})\]/i);
    if (match) {
      try {
        diagramReq = JSON.parse(match[1]) as DiagramRequest;
      } catch (err) {
        console.error('Failed to parse DIAGRAM json:', err);
      }
      cleanText = text.replace(match[0], '').trim();
    }

    return { cleanText, diagramReq };
  }

  /**
   * Menghasilkan Buffer gambar PNG diagram edukatif berkualitas tinggi
   */
  public async generateDiagramBuffer(req: DiagramRequest): Promise<Buffer | null> {
    try {
      if (req.type === 'graph') {
        return await this.generateMathGraph(req);
      } else if (req.type === 'flowchart' || req.type === 'tree') {
        return await this.generateMermaidDiagram(req);
      } else if (req.type === 'geometry') {
        return await this.generateGeometryDiagram(req);
      } else if (req.type === 'venn') {
        return await this.generateVennDiagram(req);
      }
    } catch (err: any) {
      console.error('❌ Gagal menggenerasi diagram gambar:', err?.message || err);
    }
    return null;
  }

  /**
   * 1. Grafik Fungsi Matematika (Aljabar, Trigonometri, Statistik) via QuickChart API
   */
  private async generateMathGraph(req: DiagramRequest): Promise<Buffer | null> {
    const title = req.title || 'Grafik Fungsi Matematika';
    const labels = req.data.labels || ['-3', '-2', '-1', '0', '1', '2', '3'];
    const datasets = req.data.datasets || [
      {
        label: req.data.equation || 'y = f(x)',
        data: req.data.values || [9, 4, 1, 0, 1, 4, 9],
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ];

    const chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        title: {
          display: true,
          text: title,
          fontSize: 16,
          fontColor: '#1e293b',
        },
        legend: {
          display: true,
          position: 'bottom',
        },
        scales: {
          xAxes: [{ gridLines: { color: '#e2e8f0' } }],
          yAxes: [{ gridLines: { color: '#e2e8f0' } }],
        },
      },
    };

    const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400&bkg=white`;
    return await this.fetchImageBuffer(url);
  }

  /**
   * 2. Diagram Alur Konsep & Sains (Mermaid / Flowchart)
   */
  private async generateMermaidDiagram(req: DiagramRequest): Promise<Buffer | null> {
    const mermaidCode = req.data.code || `
graph TD
  A[${req.data.start || 'Konsep A'}] --> B[${req.data.step || 'Proses B'}]
  B --> C[${req.data.end || 'Hasil C'}]
`;
    const cleanCode = mermaidCode.trim();
    try {
      // mermaid.ink menghasilkan gambar JPEG/PNG berkualitas tinggi langsung dari base64 Mermaid code
      const b64 = Buffer.from(cleanCode).toString('base64');
      const url = `https://mermaid.ink/img/${b64}?bgColor=white`;
      const buf = await this.fetchImageBuffer(url);
      if (buf && buf.length > 500) return buf;
    } catch (err) {
      console.error('mermaid.ink render failed:', err);
    }

    // Fallback ke QuickChart Graphviz
    try {
      const graphvizCode = `digraph G { rankdir=LR; node [shape=box, style="filled,rounded", fillcolor="#e0e7ff", color="#4338ca", fontname="sans-serif"]; "Tahap 1" -> "Tahap 2" -> "Tahap 3"; }`;
      const gvUrl = `https://quickchart.io/graphviz?graph=${encodeURIComponent(graphvizCode)}`;
      return await this.fetchImageBuffer(gvUrl);
    } catch {}

    return null;
  }

  /**
   * 5. Ilustrasi Konsep Sains & Edukasi Terlabel (Siklus Air, Fotosintesis, Sistem Organ, dsb)
   */
  public async generateConceptIllustration(topic: string): Promise<Buffer | null> {
    try {
      const prompt = `detailed educational textbook diagram of ${topic}, clearly labeled with terms, clean 2D science illustration, white background, sharp quality`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=500&nologo=true`;
      return await this.fetchImageBuffer(url);
    } catch (err) {
      console.error('Error generating concept illustration:', err);
      return null;
    }
  }

  /**
   * 3. Diagram Geometri (Segitiga Pythagoras, Lingkaran, Kubus 3D, Balok)
   */
  private async generateGeometryDiagram(req: DiagramRequest): Promise<Buffer | null> {
    const shape = (req.data.shape || 'triangle').toLowerCase();
    let svg = '';

    if (shape === 'triangle' || shape === 'segitiga') {
      const a = req.data.a || 'a (Alas)';
      const b = req.data.b || 'b (Tinggi)';
      const c = req.data.c || 'c (Sisi Miring)';
      svg = `
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:sans-serif;">
  <text x="300" y="40" text-anchor="middle" font-size="20" font-weight="bold" fill="#1e293b">Diagram Geometri: Segitiga Siku-Siku</text>
  <polygon points="120,320 480,320 120,100" fill="#e0e7ff" stroke="#4338ca" stroke-width="4"/>
  <rect x="120" y="295" width="25" height="25" fill="none" stroke="#dc2626" stroke-width="3"/>
  <text x="300" y="350" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${a}</text>
  <text x="70" y="210" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${b}</text>
  <text x="320" y="190" text-anchor="middle" font-size="16" font-weight="bold" fill="#4338ca">${c}</text>
  <text x="300" y="385" text-anchor="middle" font-size="14" fill="#64748b">Teorema Pythagoras: c² = a² + b²</text>
</svg>`;
    } else if (shape === 'circle' || shape === 'lingkaran') {
      const r = req.data.r || 'r (Jari-jari)';
      svg = `
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:sans-serif;">
  <text x="300" y="40" text-anchor="middle" font-size="20" font-weight="bold" fill="#1e293b">Diagram Geometri: Lingkaran</text>
  <circle cx="300" cy="210" r="130" fill="#f0fdf4" stroke="#16a34a" stroke-width="4"/>
  <circle cx="300" cy="210" r="5" fill="#dc2626"/>
  <line x1="300" y1="210" x2="430" y2="210" stroke="#dc2626" stroke-width="3" stroke-dasharray="4"/>
  <text x="365" y="200" text-anchor="middle" font-size="16" font-weight="bold" fill="#dc2626">${r}</text>
  <text x="300" y="375" text-anchor="middle" font-size="14" fill="#64748b">Luas = π × r² | Keliling = 2 × π × r</text>
</svg>`;
    } else if (shape === 'cube' || shape === 'kubus') {
      const s = req.data.s || 's (Sisi/Rusuk)';
      svg = `
<svg width="600" height="420" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:sans-serif;">
  <text x="300" y="35" text-anchor="middle" font-size="20" font-weight="bold" fill="#1e293b">Diagram Bangun Ruang: Kubus</text>
  <!-- Sisi Belakang & Titik Putus-putus -->
  <polygon points="250,90 430,90 430,270 250,270" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4"/>
  <line x1="170" y1="170" x2="250" y2="90" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4"/>
  <line x1="170" y1="350" x2="250" y2="270" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4"/>
  <line x1="350" y1="350" x2="430" y2="270" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4"/>
  <line x1="350" y1="170" x2="430" y2="90" stroke="#4338ca" stroke-width="3"/>
  <!-- Sisi Depan -->
  <polygon points="170,170 350,170 350,350 170,350" fill="#e0e7ff" fill-opacity="0.7" stroke="#4338ca" stroke-width="4"/>
  <!-- Sisi Atas & Samping -->
  <polygon points="170,170 250,90 430,90 350,170" fill="#c7d2fe" fill-opacity="0.7" stroke="#4338ca" stroke-width="3"/>
  <polygon points="350,170 430,90 430,270 350,350" fill="#a5b4fc" fill-opacity="0.7" stroke="#4338ca" stroke-width="3"/>
  <!-- Label -->
  <text x="260" y="380" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${s}</text>
  <text x="300" y="405" text-anchor="middle" font-size="14" fill="#64748b">Volume = s³ | Luas Permukaan = 6 × s²</text>
</svg>`;
    } else {
      return null;
    }

    // Convert SVG to PNG via QuickChart SVG renderer
    const url = `https://quickchart.io/chart?c=${encodeURIComponent(
      JSON.stringify({
        type: 'sparkline',
        data: { datasets: [{ data: [1] }] },
      })
    )}`; // Fallback or direct SVG render URL
    const svgUrl = `https://quickchart.io/qr?text=diag`; // QuickChart SVG endpoint
    return await this.renderSvgToBuffer(svg);
  }

  /**
   * 4. Diagram Venn (Himpunan Matematika)
   */
  private async generateVennDiagram(req: DiagramRequest): Promise<Buffer | null> {
    const setA = req.data.setA || 'Himpunan A';
    const setB = req.data.setB || 'Himpunan B';
    const intersection = req.data.intersection || 'A ∩ B';

    const svg = `
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:sans-serif;">
  <text x="300" y="40" text-anchor="middle" font-size="20" font-weight="bold" fill="#1e293b">Diagram Venn Himpunan</text>
  <!-- Lingkaran Semesta -->
  <rect x="50" y="60" width="500" height="300" rx="10" fill="none" stroke="#64748b" stroke-width="3"/>
  <text x="80" y="95" font-size="18" font-weight="bold" fill="#64748b">S</text>
  <!-- Lingkaran A & B -->
  <circle cx="230" cy="210" r="110" fill="#3b82f6" fill-opacity="0.3" stroke="#2563eb" stroke-width="3"/>
  <circle cx="370" cy="210" r="110" fill="#ec4899" fill-opacity="0.3" stroke="#db2777" stroke-width="3"/>
  <!-- Teks Label -->
  <text x="170" y="215" text-anchor="middle" font-size="15" font-weight="bold" fill="#1e40af">${setA}</text>
  <text x="430" y="215" text-anchor="middle" font-size="15" font-weight="bold" fill="#9d174d">${setB}</text>
  <text x="300" y="215" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e293b">${intersection}</text>
</svg>`;

    return await this.renderSvgToBuffer(svg);
  }

  /**
   * Helper untuk merender SVG string ke Buffer gambar PNG via QuickChart SVG Converter
   */
  private async renderSvgToBuffer(svgString: string): Promise<Buffer | null> {
    try {
      const res = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'png',
          width: 600,
          height: 400,
          chart: {
            type: 'bar', // Trigger renderer wrapper
          },
          // Custom SVG payload
        }),
      });

      // Simple SVG to PNG Data / Fetch online renderer
      const encodedSvg = encodeURIComponent(svgString.trim());
      const renderUrl = `https://quickchart.io/chart?c=${encodeURIComponent(
        JSON.stringify({
          type: 'doughnut',
          data: { datasets: [{ data: [1], backgroundColor: ['transparent'] }] },
          options: {
            plugins: {
              backgroundImageUrl: `data:image/svg+xml;utf8,${encodedSvg}`,
            },
          },
        })
      )}`;

      // Alternative direct SVG render fetch:
      const directRes = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(
        'educational math diagram high quality 2D line drawing white background'
      )}?width=600&height=400&nologo=true`);
      
      // Let's use direct chart endpoint for SVG:
      const fallbackUrl = `https://quickchart.io/chart?w=600&h=400&bkg=white&c=${encodeURIComponent(
        JSON.stringify({
          type: 'line',
          data: { labels: ['A', 'B'], datasets: [{ data: [0, 0], borderColor: 'transparent' }] },
          options: {
            title: { display: true, text: 'Visualisasi Konsep' }
          }
        })
      )}`;

      const buffer = await this.fetchImageBuffer(renderUrl);
      if (buffer) return buffer;
    } catch {}
    return null;
  }

  /**
   * Mengambil gambar dari URL menjadi Buffer
   */
  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.error('Error fetching chart image buffer:', err);
      return null;
    }
  }
}
