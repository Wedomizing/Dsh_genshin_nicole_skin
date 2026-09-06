import a01 from '../assets/nicole-pv-clean/nicole-pv-01-00m17s.webp';
import a02 from '../assets/nicole-pv-clean/nicole-pv-02-00m28s.webp';
import a03 from '../assets/nicole-pv-clean/nicole-pv-03-00m40s.webp';
import a04 from '../assets/nicole-pv-clean/nicole-pv-04-00m49s.webp';
import a05 from '../assets/nicole-pv-clean/nicole-pv-05-00m55s.webp';
import a06 from '../assets/nicole-pv-clean/nicole-pv-06-01m02s.webp';
import a07 from '../assets/nicole-pv-clean/nicole-pv-07-01m17s.webp';
import a08 from '../assets/nicole-pv-clean/nicole-pv-08-01m18s.webp';
import a10 from '../assets/nicole-pv-clean/nicole-pv-10-01m30s.webp';
import a11 from '../assets/nicole-pv-clean/nicole-pv-11-01m31s.webp';
import a12 from '../assets/nicole-pv-clean/nicole-pv-12-01m40s.webp';
import a13 from '../assets/nicole-pv-clean/nicole-pv-13-01m44s.webp';
import a14 from '../assets/nicole-pv-clean/nicole-pv-14-01m47s.webp';
import a15 from '../assets/nicole-pv-clean/nicole-pv-15-01m51s.webp';

// Original frame 09 (01:26) is archived in assets, but no longer bundled or played.
// Keep the old zero-based indices solely to migrate v0.2.0's saved selection.
export const frames = [
  [a01, '00:17', 0], [a02, '00:28', 1], [a03, '00:40', 2], [a04, '00:49', 3], [a05, '00:55', 4],
  [a06, '01:02', 5], [a07, '01:17', 6], [a08, '01:18', 7], [a10, '01:30', 9],
  [a11, '01:31', 10], [a12, '01:40', 11], [a13, '01:44', 12], [a14, '01:47', 13], [a15, '01:51', 14],
].map(([src, timestamp, legacyIndex]) => ({ src, timestamp, legacyIndex }));
