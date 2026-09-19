export const BUILD_TEMPLATES = Object.freeze([
  {
    id: 'fpv-drone',
    label: 'FPV drone',
    keywords: ['fpv', 'quad', 'fpv drone', 'racing drone', 'drone'],
    parts: [
      { name: '5 inch frame', query: 'frame 5 inch' },
      { name: 'Brushless motors 2207', query: 'brushless motors 2207' },
      { name: '4-in-1 ESC', query: '4-in-1 ESC' },
      { name: 'Flight controller F7', query: 'flight controller F7' },
      { name: '5 inch propellers', query: 'propellers 5 inch' },
      { name: '6S LiPo battery', query: 'LiPo battery 6S' },
      { name: 'FPV camera', query: 'FPV camera' },
      { name: 'Video transmitter VTX', query: 'video transmitter VTX' },
      { name: 'Receiver ELRS', query: 'receiver ELRS' },
      { name: 'Radio transmitter', query: 'radio transmitter' },
      { name: 'FPV goggles', query: 'FPV goggles' },
      { name: 'LiPo charger', query: 'LiPo charger' },
      { name: 'XT60 connectors', query: 'XT60 connectors' },
      { name: 'Antenna', query: 'antenna' },
      { name: 'GoPro mount', query: 'GoPro mount', optional: true },
      { name: 'Buzzer', query: 'buzzer', optional: true },
      { name: 'Capacitor', query: 'capacitor', optional: true }
    ]
  },
  {
    id: 'camera-drone',
    label: 'Camera drone',
    keywords: ['dji', 'camera drone', 'mini drone', 'photo drone'],
    parts: [
      { name: 'Drone with camera 4K', query: 'drone with camera 4K' },
      { name: 'Spare propellers', query: 'spare propellers' },
      { name: 'Battery', query: 'battery' },
      { name: 'Charger hub', query: 'charger hub' },
      { name: 'ND filters', query: 'ND filters' },
      { name: 'Carrying case', query: 'carrying case' },
      { name: 'MicroSD card', query: 'microSD card' }
    ]
  },
  {
    id: '3d-printer',
    label: '3D printer',
    keywords: ['3d printer', '3d printing', 'printer'],
    parts: [
      { name: '3D printer', query: '3D printer' },
      { name: 'PLA filament', query: 'PLA filament' },
      { name: 'Nozzle set', query: 'nozzle set' },
      { name: 'Bed adhesive', query: 'bed adhesive' },
      { name: 'Digital calipers', query: 'digital calipers' },
      { name: 'Deburring tool', query: 'deburring tool' }
    ]
  },
  {
    id: 'gaming-pc',
    label: 'Gaming PC',
    keywords: ['gaming pc', 'gaming computer', 'desktop pc'],
    parts: [
      { name: 'CPU', query: 'CPU' },
      { name: 'Motherboard', query: 'motherboard' },
      { name: 'RAM DDR5', query: 'RAM DDR5' },
      { name: 'GPU', query: 'GPU' },
      { name: 'SSD NVMe', query: 'SSD NVMe' },
      { name: 'PSU 750W', query: 'PSU 750W' },
      { name: 'Case', query: 'PC case' },
      { name: 'CPU cooler', query: 'CPU cooler' }
    ]
  },
  {
    id: 'home-office',
    label: 'Home office',
    keywords: ['home office', 'office setup', 'workspace'],
    parts: [
      { name: '27 inch monitor', query: 'monitor 27' },
      { name: 'Mechanical keyboard', query: 'mechanical keyboard' },
      { name: 'Mouse', query: 'mouse' },
      { name: 'Webcam', query: 'webcam' },
      { name: 'Desk lamp', query: 'desk lamp' },
      { name: 'Headset', query: 'headset' },
      { name: 'Laptop stand', query: 'laptop stand' },
      { name: 'USB-C hub', query: 'USB-C hub' }
    ]
  }
]);

export function partsForBuild(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (/[,\n]/.test(value)) {
    const parts = value.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length) return { template: null, parts: parts.map((part) => ({ name: part, query: part })) };
  }
  const lower = value.toLowerCase();
  const orderedTemplates = /(?:\bdji\b|camera drone|mini drone|photo drone)/.test(lower)
    ? [...BUILD_TEMPLATES.filter((candidate) => candidate.id === 'camera-drone'), ...BUILD_TEMPLATES.filter((candidate) => candidate.id !== 'camera-drone')]
    : BUILD_TEMPLATES;
  const template = orderedTemplates.find((candidate) => candidate.keywords.some((keyword) => lower.includes(keyword)));
  return template ? { template, parts: template.parts.map((part) => ({ ...part })) } : null;
}
