// The canonical MAYA ribbon — `ribbon-v1`, the owner-approved mark.
//
// These are the same bytes the shell certified as `.signin-mark`, lifted rather than re-drawn:
// viewBox "220 408 820 474", two linear gradients (#0055ff→#08a9fc→#32c5f4 base,
// #0532ed→#007dff→#22baf5 fold) and the two ribbon paths, carried as an inline `data:` URI.
//
// 🔴 Owner decision D1: the legacy `window.MayaIdentity` runtime does NOT return. The mark is
// presentation only — no network, no storage, no authority, no business fact. A `data:` URI is
// bytes in this file, so rendering it issues no request, and nothing here is ever turned from a
// string into HTML.
export const RIBBON_V1_BACKGROUND = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%22220 408 820 474%22 fill=%22none%22 data-maya-identity=%22ribbon-v1%22%3E%3Cdefs%3E%3ClinearGradient id=%22maya-ribbon-a%22 x1=%22400%22 y1=%22485%22 x2=%22784%22 y2=%22851%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop stop-color=%22%230055ff%22/%3E%3Cstop offset=%22.5%22 stop-color=%22%2308a9fc%22/%3E%3Cstop offset=%221%22 stop-color=%22%2332c5f4%22/%3E%3C/linearGradient%3E%3ClinearGradient id=%22maya-ribbon-b%22 x1=%220%22 y1=%22580%22 x2=%220%22 y2=%22875%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop stop-color=%22%230532ed%22/%3E%3Cstop offset=%22.58%22 stop-color=%22%23007dff%22/%3E%3Cstop offset=%221%22 stop-color=%22%2322baf5%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath data-maya-ribbon=%22base%22 d=%22M240 790C238 769 249 747 262 724C302 652 363 534 406 475C445 422 503 415 541 443C586 472 600 556 631 674C691 576 751 484 821 475C900 463 945 520 941 606C939 694 946 721 984 743C1026 765 1028 799 997 827C960 865 904 870 864 846C809 814 804 747 807 651C783 682 767 715 748 746C709 812 665 863 610 853C545 844 521 783 499 716C489 684 480 653 473 636C444 689 419 747 393 801C369 854 325 873 284 850C252 834 239 814 240 790Z%22 fill=%22url(%23maya-ribbon-a)%22/%3E%3Cpath data-maya-ribbon=%22fold%22 d=%22M240 790C286 700 425 574 501 582C565 571 604 638 639 709C668 770 716 773 750 740C793 654 866 567 941 598C939 693 946 721 984 743C1026 765 1028 799 997 827C960 865 904 870 864 846C809 814 804 747 807 651C783 682 767 715 748 746C709 812 665 863 610 853C545 844 521 783 499 716C489 684 480 653 473 636C444 689 419 747 393 801C369 854 325 873 284 850C252 834 239 814 240 790Z%22 fill=%22url(%23maya-ribbon-b)%22/%3E%3C/svg%3E")';

/** The mark's own aspect, from its viewBox. */
export const RIBBON_ASPECT = '820 / 474';
