import { todayJakarta } from '@/lib/dates'

export const DAILY_QUESTIONS: string[] = [
  'Apa momen favoritmu bersama pasangan selama sebulan terakhir?',
  'Apa satu hal kecil yang dilakukan pasanganmu yang membuatmu senyum hari ini?',
  'Apa impian bersama yang paling ingin kalian wujudkan tahun ini?',
  'Sebutkan tiga kualitas terbaik dari pasanganmu.',
  'Apa cara terbaik untuk kamu mengekspresikan rasa cinta?',
  'Apa kenangan termanis yang pernah kalian ciptakan bersama?',
  'Bagaimana kamu menunjukkan dukungan saat pasanganmu sedang lelah?',
  'Apa hal baru yang ingin kalian pelajari atau coba bersama?',
  'Apa tradisi kecil yang paling kalian sukai sebagai pasangan?',
  'Apa lagu yang paling mengingatkanmu pada pasanganmu?',
  'Bagaimana cara kalian menyelesaikan perbedaan pendapat?',
  'Apa tempat yang paling ingin kalian kunjungi bersama?',
  'Apa hal yang paling kamu syukuri dari kehadiran pasanganmu?',
  'Bagaimana kalian saling menjaga keseimbangan antara waktu bersama dan waktu sendiri?',
  'Apa makanan yang paling ingin kalian masak atau makan bersama?',
  'Apa pencapaian terbesar yang pernah kalian raih bersama?',
  'Bagaimana cara pasanganmu menunjukkan bahwa ia peduli padamu?',
  'Apa topik yang paling sering kalian bicarakan dengan gembira?',
  'Apa satu perubahan kecil yang bisa kamu lakukan untuk pasanganmu minggu ini?',
  'Apa hobi atau aktivitas yang ingin kalian mulai bersama?',
  'Bagaimana kalian memastikan satu sama lain merasa dihargai?',
  'Apa film atau serial yang ingin kalian tonton bersama selanjutnya?',
  'Apa yang paling kamu rindukan dari pasanganmu saat kalian terpisah?',
  'Apa satu hal yang membuat hubungan kalian unik dibandingkan yang lain?',
  'Bagaimana cara terbaik pasanganmu menghiburmu saat kamu sedih?',
  'Apa rencana jangka panjang yang paling membuat kalian bersemangat?',
  'Apa nilai terpenting yang kalian pegang bersama sebagai pasangan?',
  'Bagaimana kalian saling mendukung dalam mencapai tujuan pribadi masing-masing?',
  'Apa hal kecil dari keseharian kalian yang paling kamu nikmati bersama?',
  'Apa yang ingin kamu sampaikan kepada pasanganmu tapi belum sempat?',
  'Bagaimana kalian merayakan keberhasilan kecil bersama?',
  'Apa satu kebiasaan baik yang ingin kalian bangun bersama?',
  'Apa yang pertama kali menarik perhatianmu dari pasanganmu?',
  'Bagaimana pasanganmu membuatmu menjadi versi terbaik dirimu?',
  'Apa aktivitas outdoor yang paling ingin kalian lakukan bersama?',
  'Apa yang paling membuatmu bahagia ketika bersama pasanganmu?',
  'Bagaimana kalian menjaga percikan cinta tetap hidup dalam keseharian?',
  'Apa buku yang ingin kalian baca bersama atau rekomendasikan satu sama lain?',
  'Apa satu tantangan yang berhasil kalian hadapi bersama dan membuatmu bangga?',
  'Bagaimana cara kalian berkomunikasi ketika salah satu dari kalian butuh ruang?',
  'Apa kenangan lucu yang selalu membuat kalian tertawa bersama?',
  'Apa mimpi terliar yang pernah kalian diskusikan bersama?',
  'Bagaimana kalian menjaga kepercayaan dan kejujuran dalam hubungan?',
  'Apa hal yang ingin kamu tingkatkan dalam dirimu untuk hubungan yang lebih baik?',
  'Apa cara favorit kalian menghabiskan hari libur bersama?',
  'Bagaimana pasanganmu menginspirasimu setiap harinya?',
  'Apa satu keputusan bersama yang kamu paling bangga telah dibuat?',
  'Apa yang membuat kamu merasa paling aman dan nyaman bersama pasanganmu?',
  'Bagaimana kalian mendukung satu sama lain di hari yang berat?',
  'Apa satu hal yang selalu ingin kamu ingat tentang masa ini bersama pasanganmu?',
]

/**
 * Question of the day, rotating by day-of-year of the JAKARTA date (Jan 1 = 1).
 * The home page renders on the server (UTC on Vercel), so the server clock's
 * local date would roll at 07:00 WIB instead of midnight.
 */
export function getTodayQuestion(dateKey: string = todayJakarta()): { question: string; index: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000)
  const index = dayOfYear % DAILY_QUESTIONS.length
  return { question: DAILY_QUESTIONS[index], index }
}
