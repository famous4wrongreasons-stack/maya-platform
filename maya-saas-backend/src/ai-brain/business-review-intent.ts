const WEAK_SPOTS_PATTERN =
  /(?:слаб[а-яёa-z]*\s+мест|где.{0,40}(?:слаб|просад|проблем)|на\s+что.{0,56}(?:обрат(?:ить|и)|смотр(?:еть|и)|обращать)|что.{0,40}(?:проседа|хрома|плохо|не\s+так))/i;

const FULL_REVIEW_PATTERN =
  /(?:(?:полн[а-яёa-z]*|подробн[а-яёa-z]*|максимальн[а-яёa-z]*|по\s+максимуму).{0,40}(?:срез|разбор|анализ|картин|аудит|отч[её]т)|(?:срез|разбор|анализ|картин|аудит|отч[её]т).{0,40}(?:полн[а-яёa-z]*|подробн[а-яёa-z]*|максимальн[а-яёa-z]*|по\s+максимуму)|аудит\s+бизнес|дай.{0,24}(?:вс[её]|максимум).{0,24}(?:видишь|можешь|данн))/i;

const REVIEW_FOLLOW_UP_PATTERN =
  /^(?:ты\s+)?(?:по\s+максимуму|максимально|подробнее|разверни|полнее|глубже|продолжай|что\s+ещ[её]|дай\s+(?:больше|подробнее|полнее|максимум))/i;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, 'е');
}

export function isBusinessReviewFollowUp(text: string): boolean {
  return REVIEW_FOLLOW_UP_PATTERN.test(normalize(text));
}

export function isComprehensiveBusinessReview(
  text: string,
  previousText = '',
): boolean {
  const current = normalize(text);
  const previous = normalize(previousText);
  if (WEAK_SPOTS_PATTERN.test(current) || FULL_REVIEW_PATTERN.test(current)) {
    return true;
  }
  return (
    isBusinessReviewFollowUp(current) &&
    (WEAK_SPOTS_PATTERN.test(previous) || FULL_REVIEW_PATTERN.test(previous))
  );
}
