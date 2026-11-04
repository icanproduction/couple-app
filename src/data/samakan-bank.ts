// Samakan v2 curated bank: 120 rounds, 20 per theme, 40 per kind.
// Every set the server deals from here is 7 rounds in the fixed kind order
// (logic.ts KIND_ORDER) with guess options shuffled once at creation.
//
// Rules for anything added here (scripts/verify/game-samakan.mjs checks them):
// - ids are stable forever: samakan_rounds.bank_id points at them for the
//   60-day no-repeat rule. Add new ids, never rename or reuse one.
// - match: 2 options, "what would you actually want"; guess: 4 options, "your
//   answer, then guess theirs"; scale: 1 to 5 between two labels that rate a
//   preference, never a virtue or a flaw (safety rule S6).
// - about the two of them as they are now: no luck rounds, no role-play.
// - safe for any couple: no bodies or looks, exes, money amounts, religion,
//   politics, in-laws, health, alcohol or gambling (logic.ts safetyIssues).
// - English, Indonesia-aware (local food, places and apps by their own names),
//   no em dashes, no hyphenated words, options of 32 characters at most.

import type { SamakanBankRound } from '@/types/samakan'

export const SAMAKAN_BANK: readonly SamakanBankRound[] = [
  // ---------- food ----------
  { id: 'food-m01', theme: 'food', kind: 'match', prompt: 'Dinner tonight?', options: ['Cook together', 'Order GoFood'], talk: 'What\'s the last thing we cooked that actually turned out well?' },
  { id: 'food-m02', theme: 'food', kind: 'match', prompt: 'Bubur ayam, how do you eat it?', options: ['Stirred, all mixed', 'Not stirred, ever'], talk: 'Who do you know with the strongest opinion on bubur?' },
  { id: 'food-m03', theme: 'food', kind: 'match', prompt: 'Martabak night. Which kind?', options: ['Martabak manis', 'Martabak telur'], talk: 'What toppings go on your perfect martabak manis?' },
  { id: 'food-m04', theme: 'food', kind: 'match', prompt: 'Eating out tonight?', options: ['Try a new place', 'Our usual spot'], talk: 'Which new place have we both been meaning to try?' },
  { id: 'food-m05', theme: 'food', kind: 'match', prompt: 'At a restaurant, how do we order?', options: ['Dishes to share', 'Each our own plate'], talk: 'Which dish would you never want to share with anyone?' },
  { id: 'food-m06', theme: 'food', kind: 'match', prompt: 'Afternoon drink?', options: ['Kopi susu', 'Es teh manis'], talk: 'What\'s your usual order at our favorite coffee place?' },
  { id: 'food-m07', theme: 'food', kind: 'match', prompt: 'Hungry after 10 pm?', options: ['Indomie at home', 'Out for nasi goreng'], talk: 'Where\'s the best late night food we\'ve found together?' },
  { id: 'food-g01', theme: 'food', kind: 'guess', prompt: 'Pick a comfort food after a long day.', options: ['Indomie telur', 'Nasi Padang', 'Mie ayam', 'Bakso'], talk: 'Where was the best one of these you\'ve ever had?' },
  { id: 'food-g02', theme: 'food', kind: 'guess', prompt: 'Which street food could you eat every day?', options: ['Sate ayam', 'Siomay', 'Cilok', 'Gorengan'], talk: 'Which seller near us makes it best?' },
  { id: 'food-g03', theme: 'food', kind: 'guess', prompt: 'Pick the Padang dish you always take.', options: ['Rendang', 'Ayam pop', 'Gulai tunjang', 'Perkedel'], talk: 'What else always ends up on your plate at a Padang place?' },
  { id: 'food-g04', theme: 'food', kind: 'guess', prompt: 'Your usual drink order?', options: ['Kopi susu gula aren', 'Matcha latte', 'Boba milk tea', 'Plain iced tea'], talk: 'What\'s the strangest drink you\'ve ever ordered?' },
  { id: 'food-g05', theme: 'food', kind: 'guess', prompt: 'Pick a snack for a long drive.', options: ['Chips', 'Roasted peanuts', 'Chocolate', 'Fresh fruit'], talk: 'Who usually finishes the snacks before we\'re out of the city?' },
  { id: 'food-g06', theme: 'food', kind: 'guess', prompt: 'Pick a dinner for your birthday.', options: ['Sushi', 'Steak', 'Korean BBQ', 'Seafood by the beach'], talk: 'What did we eat on your last birthday?' },
  { id: 'food-g07', theme: 'food', kind: 'guess', prompt: 'Which dessert wins?', options: ['Es campur', 'Klepon', 'Ice cream', 'Pisang goreng'], talk: 'Which dessert takes you straight back to being a kid?' },
  { id: 'food-s01', theme: 'food', kind: 'scale', prompt: 'How spicy can you go?', low: 'Mild only', high: 'Level 5 seblak', talk: 'What\'s the spiciest thing you\'ve ever finished?' },
  { id: 'food-s02', theme: 'food', kind: 'scale', prompt: 'How adventurous are you with new food?', low: 'My usual order', high: 'I\'ll try anything once', talk: 'What\'s the strangest food you\'ve ever tried?' },
  { id: 'food-s03', theme: 'food', kind: 'scale', prompt: 'How much do you enjoy cooking?', low: 'Order in, always', high: 'Happiest in the kitchen', talk: 'Which dish would you love to learn to cook together?' },
  { id: 'food-s04', theme: 'food', kind: 'scale', prompt: 'How sweet do you take your drinks?', low: 'No sugar at all', high: 'Extra sweet, please', talk: 'Has anyone ever made your drink totally wrong?' },
  { id: 'food-s05', theme: 'food', kind: 'scale', prompt: 'How long can you wait for food when you\'re hungry?', low: 'Feed me now', high: 'I can wait an hour', talk: 'What\'s the longest we\'ve ever queued for food?' },
  { id: 'food-s06', theme: 'food', kind: 'scale', prompt: 'How much do you check reviews before trying a place?', low: 'I just walk in', high: 'I read every review', talk: 'Which place lived up to all the hype?' },

  // ---------- weekends ----------
  { id: 'weekends-m01', theme: 'weekends', kind: 'match', prompt: 'Long weekend plan?', options: ['Staycation in town', 'Road trip out of the city'], talk: 'Where would our next road trip go?' },
  { id: 'weekends-m02', theme: 'weekends', kind: 'match', prompt: 'Rainy Sunday?', options: ['Movie marathon at home', 'Mall and coffee'], talk: 'Which movie would you happily watch again on a rainy day?' },
  { id: 'weekends-m03', theme: 'weekends', kind: 'match', prompt: 'Saturday morning?', options: ['Car Free Day walk', 'Sleep in, big brunch'], talk: 'What\'s our perfect Saturday morning, start to finish?' },
  { id: 'weekends-m04', theme: 'weekends', kind: 'match', prompt: 'Next date night?', options: ['Street food crawl', 'Nice dinner, dressed up'], talk: 'Which date night do you still think about?' },
  { id: 'weekends-m05', theme: 'weekends', kind: 'match', prompt: 'A free Saturday with no plans. Keep it that way?', options: ['Keep it empty', 'Fill it with plans'], talk: 'What would you do with a whole free day, just us?' },
  { id: 'weekends-m06', theme: 'weekends', kind: 'match', prompt: 'Sunday evening?', options: ['Get ready for the week', 'One more outing'], talk: 'What makes a Sunday evening feel good to you?' },
  { id: 'weekends-m07', theme: 'weekends', kind: 'match', prompt: 'Seeing friends this weekend?', options: ['Host them at home', 'Meet them out'], talk: 'Which friends should we see soon?' },
  { id: 'weekends-g01', theme: 'weekends', kind: 'guess', prompt: 'Your ideal Saturday night?', options: ['Movie at home', 'Night market', 'Out with friends', 'Early sleep'], talk: 'What was the best Saturday night we\'ve had this year?' },
  { id: 'weekends-g02', theme: 'weekends', kind: 'guess', prompt: 'Pick a weekend sport to try together.', options: ['Padel', 'Badminton', 'Cycling', 'Swimming'], talk: 'Which one should we actually book this month?' },
  { id: 'weekends-g03', theme: 'weekends', kind: 'guess', prompt: 'Where would you spend a free Sunday afternoon?', options: ['A bookstore', 'A cafe with a view', 'The mall', 'Our sofa'], talk: 'Which cafe would you take me to first?' },
  { id: 'weekends-g04', theme: 'weekends', kind: 'guess', prompt: 'Pick a weekend treat.', options: ['Creambath', 'Brunch', 'A long nap', 'Shopping trip'], talk: 'When did you last give yourself a proper treat?' },
  { id: 'weekends-g05', theme: 'weekends', kind: 'guess', prompt: 'What makes a weekend feel wasted to you?', options: ['No plans at all', 'Too many plans', 'Working', 'Bad weather'], talk: 'When did a weekend last feel just right?' },
  { id: 'weekends-g06', theme: 'weekends', kind: 'guess', prompt: 'Pick a show to binge this weekend.', options: ['K-drama', 'Anime', 'True crime', 'Reality show'], talk: 'Which show should we start together next?' },
  { id: 'weekends-g07', theme: 'weekends', kind: 'guess', prompt: 'Pick a quick weekend getaway.', options: ['Puncak for a night', 'Jogja by train', 'Bandung for food', 'Home, phones off'], talk: 'Which of these have we been putting off?' },
  { id: 'weekends-s01', theme: 'weekends', kind: 'scale', prompt: 'How early do you like to start a Saturday?', low: 'Before 7', high: 'After noon', talk: 'What\'s the earliest you\'ve ever happily woken up for something?' },
  { id: 'weekends-s02', theme: 'weekends', kind: 'scale', prompt: 'How much do you like busy places on a weekend?', low: 'Avoid the crowds', high: 'The busier the better', talk: 'Which busy place is still worth it for you?' },
  { id: 'weekends-s03', theme: 'weekends', kind: 'scale', prompt: 'How full do you like a weekend schedule?', low: 'Totally empty', high: 'Something every hour', talk: 'What\'s one thing that has to happen every weekend?' },
  { id: 'weekends-s04', theme: 'weekends', kind: 'scale', prompt: 'How into karaoke are you?', low: 'I\'ll hold the bags', high: 'Give me the mic', talk: 'Which song would you pick to open a karaoke night?' },
  { id: 'weekends-s05', theme: 'weekends', kind: 'scale', prompt: 'How much quiet do you need after a busy week?', low: 'None, let\'s go out', high: 'A whole day to myself', talk: 'What does a perfect recharge day look like for you?' },
  { id: 'weekends-s06', theme: 'weekends', kind: 'scale', prompt: 'How much do you like last minute plans?', low: 'Tell me a week ahead', high: 'Let\'s go in ten minutes', talk: 'What\'s the best last minute plan we\'ve ever said yes to?' },

  // ---------- home ----------
  { id: 'home-m01', theme: 'home', kind: 'match', prompt: 'Our someday home?', options: ['Apartment in the city', 'House with a small yard'], talk: 'What\'s one thing our someday home must have?' },
  { id: 'home-m02', theme: 'home', kind: 'match', prompt: 'Sleeping at night?', options: ['AC on', 'Fan only'], talk: 'Who wins the AC remote at home, honestly?' },
  { id: 'home-m03', theme: 'home', kind: 'match', prompt: 'Lights when you sleep?', options: ['Totally dark', 'A small lamp on'], talk: 'Were you scared of the dark as a kid?' },
  { id: 'home-m04', theme: 'home', kind: 'match', prompt: 'Weekend cleaning?', options: ['Clean together', 'Split the rooms'], talk: 'Which chore would you trade away forever?' },
  { id: 'home-m05', theme: 'home', kind: 'match', prompt: 'A pet at home someday?', options: ['Cat', 'Dog'], talk: 'What would our first pet be called?' },
  { id: 'home-m06', theme: 'home', kind: 'match', prompt: 'Living room style?', options: ['Plants everywhere', 'Clean and minimal'], talk: 'Whose home have you visited that felt just right?' },
  { id: 'home-m07', theme: 'home', kind: 'match', prompt: 'TV during dinner?', options: ['On, something light', 'Off, just talking'], talk: 'What do we usually end up talking about at dinner?' },
  { id: 'home-g01', theme: 'home', kind: 'guess', prompt: 'Which chore would you happily do every week?', options: ['Cooking', 'Laundry', 'Dishes', 'Groceries'], talk: 'Which chore do you secretly enjoy?' },
  { id: 'home-g02', theme: 'home', kind: 'guess', prompt: 'Your favorite spot at home?', options: ['The sofa', 'The kitchen', 'The balcony', 'My desk'], talk: 'What makes that spot feel like yours?' },
  { id: 'home-g03', theme: 'home', kind: 'guess', prompt: 'First thing you do when you get home?', options: ['Shower', 'Grab a snack', 'Sofa and phone', 'Change clothes'], talk: 'What\'s the first thing you notice when you walk in after a long day?' },
  { id: 'home-g04', theme: 'home', kind: 'guess', prompt: 'Pick a home upgrade you\'d want first.', options: ['Big TV', 'Comfy sofa', 'Coffee machine', 'Better kitchen'], talk: 'Which upgrade would we use the most?' },
  { id: 'home-g05', theme: 'home', kind: 'guess', prompt: 'Which sound do you like most at home?', options: ['Rain on the roof', 'Music playing', 'Total quiet', 'A show in the background'], talk: 'What song should be playing when we get home?' },
  { id: 'home-g06', theme: 'home', kind: 'guess', prompt: 'Which home smell is your favorite?', options: ['Fresh laundry', 'Coffee brewing', 'Something frying', 'Rain outside'], talk: 'Which smell reminds you of the home you grew up in?' },
  { id: 'home-s01', theme: 'home', kind: 'scale', prompt: 'How cold do you like the AC?', low: 'Barely on', high: 'Like a fridge', talk: 'Who\'s always reaching for a blanket?' },
  { id: 'home-s02', theme: 'home', kind: 'scale', prompt: 'How many pillows do you need to sleep well?', low: 'Just one', high: 'A whole pile', talk: 'Which pillow could you never give away?' },
  { id: 'home-s03', theme: 'home', kind: 'scale', prompt: 'How much do you like having guests over?', low: 'Rarely, please', high: 'Every weekend', talk: 'Who was the best guest we\'ve ever had over?' },
  { id: 'home-s04', theme: 'home', kind: 'scale', prompt: 'How often do you like to move furniture around?', low: 'Leave it be', high: 'Every few months', talk: 'Which corner of home would you change first?' },
  { id: 'home-s05', theme: 'home', kind: 'scale', prompt: 'How loud do you play music at home?', low: 'Barely there', high: 'Speaker at full', talk: 'Which song gets turned up every time?' },
  { id: 'home-s06', theme: 'home', kind: 'scale', prompt: 'How many plants would you want at home?', low: 'None, please', high: 'A small jungle', talk: 'Which plant would you trust us to keep alive?' },
  { id: 'home-s07', theme: 'home', kind: 'scale', prompt: 'How long do you like to sleep in on a day off?', low: 'Up at the usual time', high: 'Until noon', talk: 'What\'s your ideal first hour of a day off?' },

  // ---------- travel ----------
  { id: 'travel-m01', theme: 'travel', kind: 'match', prompt: 'Holiday photos?', options: ['Hundreds, every angle', 'A few, then phones away'], talk: 'Which trip photo of us is your favorite?' },
  { id: 'travel-m02', theme: 'travel', kind: 'match', prompt: 'Next getaway?', options: ['Beach and sunsets', 'Mountains and cool air'], talk: 'Which beach or mountain is next on our list?' },
  { id: 'travel-m03', theme: 'travel', kind: 'match', prompt: 'Going to Jogja?', options: ['By train, the scenic way', 'By plane, the quick way'], talk: 'What would you want to eat first in Jogja?' },
  { id: 'travel-m04', theme: 'travel', kind: 'match', prompt: 'Planning a trip?', options: ['Plan every day', 'Decide as we go'], talk: 'What\'s the best thing that happened on a trip that we never planned?' },
  { id: 'travel-m05', theme: 'travel', kind: 'match', prompt: 'Where to stay?', options: ['Cozy villa', 'Hotel with a pool'], talk: 'Which place we stayed in would you book again?' },
  { id: 'travel-m06', theme: 'travel', kind: 'match', prompt: 'Mornings on a trip?', options: ['Up early for sunrise', 'Slow start, long breakfast'], talk: 'Which sunrise was worth waking up for?' },
  { id: 'travel-m07', theme: 'travel', kind: 'match', prompt: 'Souvenirs from a trip?', options: ['Something for everyone', 'Just a little for us'], talk: 'Which souvenir do we still use?' },
  { id: 'travel-g01', theme: 'travel', kind: 'guess', prompt: 'Dream trip for next year?', options: ['Japan', 'Labuan Bajo', 'Korea', 'Europe'], talk: 'What would the first day of that trip look like?' },
  { id: 'travel-g02', theme: 'travel', kind: 'guess', prompt: 'Pick a must on any trip.', options: ['Local food hunt', 'Museums', 'Shopping', 'Doing nothing by a pool'], talk: 'What do you remember most from our last trip?' },
  { id: 'travel-g03', theme: 'travel', kind: 'guess', prompt: 'What do you always pack too much of?', options: ['Clothes', 'Snacks', 'Chargers and gadgets', 'Skincare'], talk: 'What did you pack last time and never touch?' },
  { id: 'travel-g04', theme: 'travel', kind: 'guess', prompt: 'Which part of a trip do you like most?', options: ['Planning it', 'Getting there', 'Being there', 'Looking at photos after'], talk: 'Which trip would you happily plan again from scratch?' },
  { id: 'travel-g05', theme: 'travel', kind: 'guess', prompt: 'Pick a place in Indonesia you\'d love to see together.', options: ['Raja Ampat', 'Toraja', 'Belitung', 'Lombok'], talk: 'What do you picture us doing there?' },
  { id: 'travel-g06', theme: 'travel', kind: 'guess', prompt: 'Which travel moment is the most you?', options: ['Lost but happy', 'Early at the gate', 'Last to board', 'Asleep before takeoff'], talk: 'What\'s our funniest travel mishap so far?' },
  { id: 'travel-s01', theme: 'travel', kind: 'scale', prompt: 'How far ahead do you plan a trip?', low: 'Book on the day', high: 'Spreadsheet ready', talk: 'Which trip took the most planning?' },
  { id: 'travel-s02', theme: 'travel', kind: 'scale', prompt: 'How early do you like to get to the airport?', low: 'Just in time', high: 'Three hours early', talk: 'Have we ever had to run for a flight?' },
  { id: 'travel-s03', theme: 'travel', kind: 'scale', prompt: 'How much do you pack for a weekend away?', low: 'One backpack', high: 'Two big suitcases', talk: 'What\'s one thing you always bring that I never would?' },
  { id: 'travel-s04', theme: 'travel', kind: 'scale', prompt: 'How much do you like long road trips?', low: 'Get me there fast', high: 'The drive is the fun part', talk: 'What\'s on our road trip playlist?' },
  { id: 'travel-s05', theme: 'travel', kind: 'scale', prompt: 'How into hiking are you?', low: 'Viewpoint by car', high: 'Bromo at 3 am', talk: 'Which view would you climb for?' },
  { id: 'travel-s06', theme: 'travel', kind: 'scale', prompt: 'How much walking do you want on a city trip?', low: 'Taxi everywhere', high: '20,000 steps a day', talk: 'Which city would you love to explore on foot?' },
  { id: 'travel-s07', theme: 'travel', kind: 'scale', prompt: 'How fancy do you like a place to stay?', low: 'A clean bed is enough', high: 'Pool villa or nothing', talk: 'What makes a hotel room feel great to you?' },

  // ---------- habits ----------
  { id: 'habits-m01', theme: 'habits', kind: 'match', prompt: 'Phones at dinner?', options: ['Face down, away', 'On the table is fine'], talk: 'When did a phone last interrupt a good moment?' },
  { id: 'habits-m02', theme: 'habits', kind: 'match', prompt: 'Charging your phone?', options: ['Every night, always', 'Only when it\'s nearly dead'], talk: 'What\'s the lowest battery you\'ve ever let your phone get to?' },
  { id: 'habits-m03', theme: 'habits', kind: 'match', prompt: 'Alarm style?', options: ['One alarm, then up', 'Several alarms'], talk: 'What\'s the hardest morning you\'ve had to get up for?' },
  { id: 'habits-m04', theme: 'habits', kind: 'match', prompt: 'Group chat notifications?', options: ['All on', 'Muted, always'], talk: 'Which group chat would you never mute?' },
  { id: 'habits-m05', theme: 'habits', kind: 'match', prompt: 'Music in the car?', options: ['Sing along playlist', 'Podcast or quiet'], talk: 'Which song do we always end up singing in the car?' },
  { id: 'habits-m06', theme: 'habits', kind: 'match', prompt: 'The toothpaste tube?', options: ['Squeeze from the end', 'Squeeze anywhere'], talk: 'What tiny thing do you do the same way every day?' },
  { id: 'habits-g01', theme: 'habits', kind: 'guess', prompt: 'First thing you do in the morning?', options: ['Coffee', 'Check my phone', 'Quick stretch', 'Hit snooze'], talk: 'What would your perfect morning look like?' },
  { id: 'habits-g02', theme: 'habits', kind: 'guess', prompt: 'When you\'re stressed, what helps most?', options: ['Talking it out', 'Quiet time alone', 'Something to eat', 'A long nap'], talk: 'What\'s something I can do that helps on a hard day?' },
  { id: 'habits-g03', theme: 'habits', kind: 'guess', prompt: 'How do you unwind at night?', options: ['Scrolling TikTok', 'A show', 'Music', 'Games on my phone'], talk: 'What\'s the last thing that made you laugh before bed?' },
  { id: 'habits-g04', theme: 'habits', kind: 'guess', prompt: 'How do you usually spend your lunch break?', options: ['Eat at my desk', 'Out with coworkers', 'Quick nap', 'Scroll and snack'], talk: 'Who\'s your favorite lunch buddy, apart from me?' },
  { id: 'habits-g05', theme: 'habits', kind: 'guess', prompt: 'Which app do you open most?', options: ['WhatsApp', 'Instagram', 'TikTok', 'YouTube'], talk: 'Which app would you delete if you had to pick one?' },
  { id: 'habits-g06', theme: 'habits', kind: 'guess', prompt: 'What do you do when you can\'t sleep?', options: ['Scroll my phone', 'Get a snack', 'Watch something', 'Lie there thinking'], talk: 'What\'s your surest way to fall asleep?' },
  { id: 'habits-g07', theme: 'habits', kind: 'guess', prompt: 'Pick your online shopping style.', options: ['Wait for the 11.11 sale', 'Buy right away', 'Ask you first', 'Window shop only'], talk: 'What\'s the best thing you\'ve ever found in a sale?' },
  { id: 'habits-s01', theme: 'habits', kind: 'scale', prompt: 'How chatty are you in the morning?', low: 'Don\'t talk to me yet', high: 'Talking before my eyes open', talk: 'What\'s the first thing you want to hear in the morning?' },
  { id: 'habits-s02', theme: 'habits', kind: 'scale', prompt: 'How much do you like surprises?', low: 'Tell me first', high: 'Surprise me anytime', talk: 'What\'s the best surprise anyone has ever given you?' },
  { id: 'habits-s03', theme: 'habits', kind: 'scale', prompt: 'How much do you like planning your day?', low: 'Go with the flow', high: 'To do list for everything', talk: 'What\'s one thing you always plan, even on slow days?' },
  { id: 'habits-s04', theme: 'habits', kind: 'scale', prompt: 'How much do you like voice notes?', low: 'Text me instead', high: 'Voice notes all day', talk: 'Who sends the longest voice notes you know?' },
  { id: 'habits-s05', theme: 'habits', kind: 'scale', prompt: 'How much do you like trying new apps and gadgets?', low: 'Old phone forever', high: 'First in line', talk: 'Which gadget do you use every single day?' },
  { id: 'habits-s06', theme: 'habits', kind: 'scale', prompt: 'How much do you like long phone calls?', low: 'Text is enough', high: 'Hours on the phone', talk: 'What did we talk about on our longest call?' },
  { id: 'habits-s07', theme: 'habits', kind: 'scale', prompt: 'How much do you like routines?', low: 'Every day different', high: 'Same routine, happy', talk: 'Which part of your routine would you never give up?' },

  // ---------- plans ----------
  { id: 'plans-m01', theme: 'plans', kind: 'match', prompt: 'Our next big trip?', options: ['Somewhere in Indonesia', 'Somewhere abroad'], talk: 'Which days off should we save for it?' },
  { id: 'plans-m02', theme: 'plans', kind: 'match', prompt: 'Celebrating our anniversary?', options: ['Big plan, all day', 'Quiet dinner, just us'], talk: 'Which anniversary has been your favorite so far?' },
  { id: 'plans-m03', theme: 'plans', kind: 'match', prompt: 'Learning something together?', options: ['A cooking class', 'A dance class'], talk: 'What else would you want to learn with me?' },
  { id: 'plans-m04', theme: 'plans', kind: 'match', prompt: 'Someday, our own small business?', options: ['A cozy cafe', 'An online shop'], talk: 'What would we call it?' },
  { id: 'plans-m05', theme: 'plans', kind: 'match', prompt: 'Our next date idea?', options: ['Something we\'ve never done', 'Our favorite, again'], talk: 'What\'s one date we should repeat this year?' },
  { id: 'plans-m06', theme: 'plans', kind: 'match', prompt: 'Growing old together, where?', options: ['Big city, close to everything', 'Quiet town, close to nature'], talk: 'What does an ordinary day look like for us at 70?' },
  { id: 'plans-g01', theme: 'plans', kind: 'guess', prompt: 'Which skill would you love to learn this year?', options: ['Swimming', 'Driving', 'Cooking', 'A new language'], talk: 'Which of these could we learn together?' },
  { id: 'plans-g02', theme: 'plans', kind: 'guess', prompt: 'If we had a free month, what would you do?', options: ['Travel slowly', 'Learn something', 'Rest at home', 'Start a project'], talk: 'Which of these could we squeeze into a long weekend?' },
  { id: 'plans-g03', theme: 'plans', kind: 'guess', prompt: 'Pick a date we haven\'t done yet.', options: ['Pottery class', 'A big concert', 'Glamping trip', 'Stargazing night'], talk: 'Which one should we book first?' },
  { id: 'plans-g04', theme: 'plans', kind: 'guess', prompt: 'Pick a name for a future cat.', options: ['Mochi', 'Oyen', 'Kopi', 'Milo'], talk: 'What would our cat be like, do you think?' },
  { id: 'plans-g05', theme: 'plans', kind: 'guess', prompt: 'Which goal matters most to you this year?', options: ['Travel more', 'Learn a new skill', 'More time with friends', 'More rest'], talk: 'What would that look like by December?' },
  { id: 'plans-g06', theme: 'plans', kind: 'guess', prompt: 'Where would you live for a year if you could?', options: ['Bali', 'Tokyo', 'Seoul', 'Melbourne'], talk: 'What would we miss most about home?' },
  { id: 'plans-g07', theme: 'plans', kind: 'guess', prompt: 'Pick a car for our dream road trip.', options: ['Classic VW Combi', 'Big SUV', 'Small city car', 'Motorbike'], talk: 'Where would that road trip end?' },
  { id: 'plans-s01', theme: 'plans', kind: 'scale', prompt: 'How much do you like big celebrations?', low: 'Low key, please', high: 'Go all out', talk: 'What\'s the best party you\'ve ever been to?' },
  { id: 'plans-s02', theme: 'plans', kind: 'scale', prompt: 'How far ahead do you like to plan our dates?', low: 'Same day', high: 'A month ahead', talk: 'Which date are you already looking forward to?' },
  { id: 'plans-s03', theme: 'plans', kind: 'scale', prompt: 'How open are you to living abroad someday?', low: 'Never', high: 'Pack my bags', talk: 'Which country could you see us living in?' },
  { id: 'plans-s04', theme: 'plans', kind: 'scale', prompt: 'How much does a quiet life in a small town appeal to you?', low: 'City forever', high: 'Small town, slow life', talk: 'Which small town have we visited that you could live in?' },
  { id: 'plans-s05', theme: 'plans', kind: 'scale', prompt: 'How much do you like trying things for the first time?', low: 'Stick to what I know', high: 'Always up for new', talk: 'What\'s something new you\'d try only with me?' },
  { id: 'plans-s06', theme: 'plans', kind: 'scale', prompt: 'How excited are you to plan our next trip?', low: 'Tell me when it\'s booked', high: 'I already have a list', talk: 'What\'s at the top of your list?' },
  { id: 'plans-s07', theme: 'plans', kind: 'scale', prompt: 'How much do you like keeping traditions?', low: 'Something new every year', high: 'Same place, every year', talk: 'Which little tradition of ours would you keep forever?' },
]

/** Bank rounds by id (for the results view and the 60-day history). */
export const SAMAKAN_BANK_BY_ID: ReadonlyMap<string, SamakanBankRound> = new Map(SAMAKAN_BANK.map((r) => [r.id, r]))
