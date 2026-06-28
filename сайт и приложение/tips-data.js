window.TIPS_CONFIG = {
  baseUrl: 'https://malesthetic.pro/tips.html',
  salon: {
    name: 'Мужская Эстетика',
    city: 'Ставрополь',
    phone: '+7 962 447-67-47'
  },
  amounts: [100, 200, 300, 500, 1000],
  minAmount: 50,
  maxAmount: 15000,
  commentPrefix: 'Чаевые',
  // Чаевые идут через YClients (платёж — ЮMoney). bankAppUrl = персональная
  // страница чаевых мастера; QR-наклейку генерируем именно на неё (скан → оплата).
  masters: [
    {
      slug: 'stas',
      yclientsId: 1461615,
      name: 'Стас Мосин',
      rank: 'Топ-мастер',
      initials: 'СМ',
      photo: 'https://malesthetic.pro/app/stas-photo.jpg',
      sbpPhone: '',
      sbpBank: '',
      cardLabel: '',
      bankAppUrl: 'https://yclients.com/tips/external/503759/72729db8-1b90-4e41-bc10-646f0ea3eeeb/',
      qrImage: 'tips-qrs/stas.png'
    },
    {
      slug: 'ilya',
      yclientsId: 1460233,
      name: 'Илья Третьяков',
      rank: 'Топ-мастер',
      initials: 'ИТ',
      photo: 'https://malesthetic.pro/app/ilya-photo.jpg',
      sbpPhone: '',
      sbpBank: '',
      cardLabel: '',
      bankAppUrl: 'https://yclients.com/tips/external/503759/28075668-c8d2-4c38-8b78-1f303c895b67/',
      qrImage: 'tips-qrs/ilya.png'
    },
    {
      slug: 'alexey',
      yclientsId: 1461618,
      name: 'Алексей Дарма',
      rank: 'Старший мастер',
      initials: 'АД',
      photo: 'https://malesthetic.pro/app/alexey-photo.jpg',
      sbpPhone: '',
      sbpBank: '',
      cardLabel: '',
      bankAppUrl: 'https://yclients.com/tips/external/503759/5e056fd9-9703-4006-afb4-569c31aad31b/',
      qrImage: 'tips-qrs/alexey.png'
    },
    {
      slug: 'maxim',
      yclientsId: 1461621,
      name: 'Максим Чурсинов',
      rank: 'Старший мастер',
      initials: 'МЧ',
      photo: 'https://malesthetic.pro/app/max-photo.jpg',
      sbpPhone: '',
      sbpBank: '',
      cardLabel: '',
      bankAppUrl: 'https://yclients.com/tips/external/503759/f86bfdcb-0aba-4acb-af3b-a6610dda3f41/',
      qrImage: 'tips-qrs/maxim.png'
    },
    {
      slug: 'alexander',
      yclientsId: 3278920,
      name: 'Александр Киянский',
      rank: 'Старший мастер',
      initials: 'АК',
      photo: 'https://malesthetic.pro/app/alexander-photo.jpg',
      sbpPhone: '',
      sbpBank: '',
      cardLabel: '',
      bankAppUrl: 'https://yclients.com/tips/external/503759/452e67f6-4936-4191-894e-5313fcb57b14/',
      qrImage: 'tips-qrs/alexander.png'
    }
  ]
};
