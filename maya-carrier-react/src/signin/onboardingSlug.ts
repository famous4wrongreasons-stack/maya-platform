const latin: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** An editable suggestion, never a claim that this business name is available. */
export function suggestBusinessSlug(name: string): string {
  return [...name.toLowerCase()].map(letter => latin[letter] ?? letter).join('')
    .normalize('NFKD').replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]+/g, '-')
    .slice(0, 100).replace(/^-+|-+$/g, '');
}
