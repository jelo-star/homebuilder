/**
 * Comprehensive Philippine Regions and Provinces
 * Covering all 17 Administrative Regions and 82 Provinces of the Philippines.
 */

export interface PhilippineRegionGroup {
  region: string;
  code: string;
  provinces: string[];
}

export const PHILIPPINE_REGIONS: PhilippineRegionGroup[] = [
  {
    region: 'National Capital Region (NCR)',
    code: 'NCR',
    provinces: ['Metro Manila (NCR)']
  },
  {
    region: 'Cordillera Administrative Region (CAR)',
    code: 'CAR',
    provinces: ['Abra', 'Apayao', 'Benguet', 'Baguio City', 'Ifugao', 'Kalinga', 'Mountain Province']
  },
  {
    region: 'Region I – Ilocos Region',
    code: 'Region I',
    provinces: ['Ilocos Norte', 'Ilocos Sur', 'La Union', 'Pangasinan']
  },
  {
    region: 'Region II – Cagayan Valley',
    code: 'Region II',
    provinces: ['Batanes', 'Cagayan', 'Isabela', 'Nueva Vizcaya', 'Quirino']
  },
  {
    region: 'Region III – Central Luzon',
    code: 'Region III (Central Luzon)',
    provinces: ['Aurora', 'Bataan', 'Bulacan', 'Nueva Ecija', 'Pampanga', 'Tarlac', 'Zambales']
  },
  {
    region: 'Region IV-A – CALABARZON',
    code: 'Region IV-A (Calabarzon)',
    provinces: ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal']
  },
  {
    region: 'Region IV-B – MIMAROPA',
    code: 'MIMAROPA',
    provinces: ['Marinduque', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan', 'Romblon']
  },
  {
    region: 'Region V – Bicol Region',
    code: 'Region V',
    provinces: ['Albay', 'Camarines Norte', 'Camarines Sur', 'Catanduanes', 'Masbate', 'Sorsogon']
  },
  {
    region: 'Region VI – Western Visayas',
    code: 'Region VI',
    provinces: ['Aklan', 'Antique', 'Capiz', 'Guimaras', 'Iloilo', 'Negros Occidental']
  },
  {
    region: 'Region VII – Central Visayas',
    code: 'Region VII (Central Visayas)',
    provinces: ['Bohol', 'Cebu', 'Negros Oriental', 'Siquijor']
  },
  {
    region: 'Region VIII – Eastern Visayas',
    code: 'Region VIII',
    provinces: ['Biliran', 'Eastern Samar', 'Leyte', 'Northern Samar', 'Samar (Western Samar)', 'Southern Leyte']
  },
  {
    region: 'Region IX – Zamboanga Peninsula',
    code: 'Region IX',
    provinces: ['Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay']
  },
  {
    region: 'Region X – Northern Mindanao',
    code: 'Region X',
    provinces: ['Bukidnon', 'Camiguin', 'Lanao del Norte', 'Misamis Occidental', 'Misamis Oriental']
  },
  {
    region: 'Region XI – Davao Region',
    code: 'Region XI (Davao Region)',
    provinces: ['Davao de Oro (Compostela Valley)', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental']
  },
  {
    region: 'Region XII – SOCCSKSARGEN',
    code: 'Region XII',
    provinces: ['Cotabato (North Cotabato)', 'Sarangani', 'South Cotabato', 'Sultan Kudarat']
  },
  {
    region: 'Region XIII – Caraga Region',
    code: 'Caraga',
    provinces: ['Agusan del Norte', 'Agusan del Sur', 'Dinagat Islands', 'Surigao del Norte', 'Surigao del Sur']
  },
  {
    region: 'BARMM – Bangsamoro Autonomous Region in Muslim Mindanao',
    code: 'BARMM',
    provinces: ['Basilan', 'Lanao del Sur', 'Maguindanao del Norte', 'Maguindanao del Sur', 'Sulu', 'Tawi-Tawi']
  }
];

export const ALL_PHILIPPINE_PROVINCES: string[] = PHILIPPINE_REGIONS.flatMap(r => r.provinces);

export function getRegionCodeForProvince(provName: string | null | undefined): string {
  if (!provName) return 'NCR';
  const clean = provName.toLowerCase().trim();
  if (clean.includes('manila') || clean.includes('ncr')) return 'NCR';
  
  for (const group of PHILIPPINE_REGIONS) {
    for (const p of group.provinces) {
      if (p.toLowerCase().includes(clean) || clean.includes(p.toLowerCase())) {
        return group.code;
      }
    }
  }
  return 'Other Provinces';
}

