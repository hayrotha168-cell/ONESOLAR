// App version and release notes. To publish a release:
//   1. Raise "version" in package.json (e.g. 1.2.0 → 1.3.0).
//   2. Add an entry at the top of CHANGELOG below.
//   3. npm run deploy — open apps then show "New version available".

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? '';
export const COMMIT = process.env.NEXT_PUBLIC_COMMIT ?? '';

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  en: string[];
  km: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.5.0',
    date: '2026-11-24',
    en: [
      'Edit saved projects: change the project name, customer, phone, address and notes.',
    ],
    km: [
      'កែសម្រួលគម្រោងដែលបានរក្សាទុក៖ ប្តូរឈ្មោះគម្រោង អតិថិជន ទូរស័ព្ទ អាសយដ្ឋាន និងកំណត់ចំណាំ។',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-24',
    en: [
      'Paste a Google Maps link (Share → Copy link) or coordinates into the map search to place the pin.',
      'Open in Google Maps from the map and the Sun survey.',
    ],
    km: [
      'បិទភ្ជាប់តំណ Google Maps (ចែករំលែក → ចម្លងតំណ) ឬកូអរដោនេ ក្នុងប្រអប់ស្វែងរកផែនទី ដើម្បីដាក់ម្ជុល។',
      'បើកក្នុង Google Maps ពីផែនទី និងការសិក្សាព្រះអាទិត្យ។',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-24',
    en: [
      'Choose the site on a map: search a place, tap or drag the pin on the roof, satellite view and your current location.',
      'Number boxes can be cleared and retyped (Tilt, Azimuth and all others).',
    ],
    km: [
      'ជ្រើសរើសទីតាំងលើផែនទី៖ ស្វែងរកទីកន្លែង ចុច ឬអូសម្ជុលលើដំបូល ទិដ្ឋភាពផ្កាយរណប និងទីតាំងបច្ចុប្បន្នរបស់អ្នក។',
      'ប្រអប់លេខអាចលុប ហើយវាយបញ្ចូលថ្មីបាន (មុំទេរ ទិស និងប្រអប់ផ្សេងទៀត)។',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-23',
    en: [
      'Dark mode: choose Auto, Light or Dark in Settings, or tap ☀️ / 🌙 at the top.',
    ],
    km: [
      'របៀបងងឹត៖ ជ្រើសរើស ស្វ័យប្រវត្តិ ភ្លឺ ឬងងឹត នៅក្នុងការកំណត់ ឬចុច ☀️ / 🌙 នៅខាងលើ។',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-23',
    en: [
      'Version manager: see the app version, check for updates and update with one tap.',
      'Settings moved to its own tab in the bottom menu.',
    ],
    km: [
      'កម្មវិធីគ្រប់គ្រងកំណែ៖ មើលកំណែកម្មវិធី ពិនិត្យរកបច្ចុប្បន្នភាព និងធ្វើបច្ចុប្បន្នភាពដោយចុចតែម្តង។',
      'ការកំណត់ត្រូវបានផ្លាស់ទៅផ្ទាំងផ្ទាល់ខ្លួននៅម៉ឺនុយខាងក្រោម។',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-23',
    en: [
      'Lowest and highest day, monthly average and savings on your electric bill.',
      'Electricity price in USD or riel.',
      'Panels turn white at night; the sun stays visible below the horizon.',
      'Reset all inputs buttons.',
    ],
    km: [
      'ថ្ងៃទាបបំផុត និងខ្ពស់បំផុត មធ្យមប្រចាំខែ និងការសន្សំលើវិក្កយបត្រអគ្គិសនី។',
      'តម្លៃអគ្គិសនីជាដុល្លារ ឬរៀល។',
      'ផ្ទាំងសូឡាប្រែជាពណ៌សពេលយប់ ហើយព្រះអាទិត្យនៅតែមើលឃើញពេលនៅក្រោមជើងមេឃ។',
      'ប៊ូតុងកំណត់ទិន្នន័យទាំងអស់ឡើងវិញ។',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-23',
    en: [
      'Cable size calculator (IEC 60364-5-52, EN 50618, IEC 62548).',
      '3D sun path with compass mode and zoom, phone shade survey.',
      'Project history with 3D pictures and PDF reports.',
      'Telegram sign-in, English and Khmer.',
    ],
    km: [
      'ការគណនាទំហំខ្សែ (IEC 60364-5-52, EN 50618, IEC 62548)។',
      'គន្លងព្រះអាទិត្យ 3D ជាមួយត្រីវិស័យ និងការពង្រីក ការសិក្សាម្លប់ដោយទូរស័ព្ទ។',
      'ប្រវត្តិគម្រោងជាមួយរូបភាព 3D និងរបាយការណ៍ PDF។',
      'ចូលតាម Telegram ភាសាអង់គ្លេស និងខ្មែរ។',
    ],
  },
];
