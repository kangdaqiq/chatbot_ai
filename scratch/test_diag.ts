import { DiagramService } from '../src/services/diagram.service';

async function test() {
  const svc = new DiagramService();
  
  console.log('Testing flowchart:');
  const bufFlow = await svc.generateDiagramBuffer({
    type: 'flowchart',
    data: {
      code: 'graph TD; A[Evaporasi Air Laut] --> B[Kondensasi Awan]; B --> C[Presipitasi Hujan]; C --> A;'
    }
  });
  console.log('Flowchart result buffer length:', bufFlow?.length);

  console.log('Testing math graph:');
  const bufGraph = await svc.generateDiagramBuffer({
    type: 'graph',
    title: 'Grafik y = x^2',
    data: {
      labels: ['-2', '-1', '0', '1', '2'],
      values: [4, 1, 0, 1, 4]
    }
  });
  console.log('Graph result buffer length:', bufGraph?.length);

  console.log('Testing geometry:');
  const bufGeo = await svc.generateDiagramBuffer({
    type: 'geometry',
    data: {
      shape: 'triangle',
      a: '6 cm',
      b: '8 cm',
      c: '10 cm'
    }
  });
  console.log('Geometry result buffer length:', bufGeo?.length);
}

test().catch(console.error);
