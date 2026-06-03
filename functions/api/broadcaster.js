// GET /api/broadcaster        -> { country, name, b, t } for the visitor's detected country
//                                (country:null when Cloudflare can't determine it)
// GET /api/broadcaster?all=1   -> { countries:[...] } full sorted list for the modal
//
// Country comes free from Cloudflare's CF-IPCountry header. Data is per-country
// (one broadcaster set covers all 104 matches in almost every territory) and static,
// curated from public broadcaster announcements as of May 2026. Informational only.

// [name, broadcaster(s), tier]  tier: free | paid | mixed
const B = {
  AF:['Afghanistan','ATN','paid'], AL:['Albania','TV Klan','free'], AD:['Andorra','RTVE, M6','free'],
  AR:['Argentina','Telefe, TV Pública, TyC Sports','mixed'], AM:['Armenia','AMPTV','free'],
  AU:['Australia','SBS, SBS Viceland, SBS On Demand','free'], AT:['Austria','ORF, ServusTV','mixed'],
  AZ:['Azerbaijan','İTV','free'], BE:['Belgium','VRT, RTBF','free'], BO:['Bolivia','Red Uno, Unitel','free'],
  BA:['Bosnia & Herzegovina','Arena Sport','paid'], BR:['Brazil','Grupo Globo, CazéTV (free on YouTube), SBT','mixed'],
  BG:['Bulgaria','BNT','free'], KH:['Cambodia','Hang Meas','free'], CA:['Canada','Bell Media (CTV, TSN, RDS)','mixed'],
  CL:['Chile','Chilevisión','free'], CN:['China','CMG (CCTV)','free'],
  CO:['Colombia','Caracol TV, Canal RCN, Win Sports','mixed'], CR:['Costa Rica','Teletica','free'],
  HR:['Croatia','HRT','free'], CZ:['Czechia','Czech Television','free'], DK:['Denmark','DR, TV2','mixed'],
  EC:['Ecuador','Teleamazonas','free'], SV:['El Salvador','TCS, Tigo Sports','mixed'],
  FJ:['Fiji','Fijian Broadcasting Corporation','free'], FI:['Finland','Yle, MTV3','mixed'],
  FR:['France','M6, beIN Sports','mixed'], GE:['Georgia','GPB','free'],
  DE:['Germany','ARD, ZDF, Magenta Sport','mixed'], GR:['Greece','ERT','free'],
  GT:['Guatemala','Chapín TV, Tigo Sports','mixed'], HN:['Honduras','Televicentro','free'],
  HK:['Hong Kong','Now TV (paid, 4K), ViuTV (select, free)','mixed'], HU:['Hungary','MTVA','free'],
  IS:['Iceland','RÚV','free'], ID:['Indonesia','TVRI, RRI','free'], IR:['Iran','IRIB TV3, Persiana Sports','free'],
  IL:['Israel','KAN','free'], IT:['Italy','RAI, DAZN','mixed'],
  JP:['Japan','DAZN, NHK, Nippon TV, Fuji TV','mixed'], KZ:['Kazakhstan','QAZTRK','free'],
  KG:['Kyrgyzstan','KTRK','free'], LI:['Liechtenstein','SRG SSR','free'], LU:['Luxembourg','VRT, RTBF','free'],
  MO:['Macau','TDM','free'], MV:['Maldives','ICE Networks, Medianet','paid'], MT:['Malta','PBS','free'],
  MX:['Mexico','TelevisaUnivisión, TV Azteca (free), ViX (all 104, paid)','mixed'], MN:['Mongolia','MME','free'],
  ME:['Montenegro','Arena Sport, RTCG','mixed'], NP:['Nepal','Acepro Media','mixed'],
  NL:['Netherlands','NOS','free'], NZ:['New Zealand','TVNZ 1, TVNZ+ (Event Pass, paid)','mixed'],
  NI:['Nicaragua','Televideo','free'], NE:['Niger','ORTN','free'],
  MK:['North Macedonia','Arena Sport','paid'], NO:['Norway','NRK, TV2','mixed'],
  PA:['Panama','RPC, TVN, Tigo Sports','mixed'], PY:['Paraguay','Trece, Unicanal, GEN TV','free'],
  PE:['Peru','América Televisión','free'], PH:['Philippines','Aleph Group','mixed'], PL:['Poland','TVP','free'],
  PT:['Portugal','Sport TV, LiveModeTV','paid'], RO:['Romania','Antena','free'], RU:['Russia','Match TV','free'],
  SM:['San Marino','RAI, DAZN','mixed'], RS:['Serbia','Arena Sport','paid'], SG:['Singapore','Mediacorp','free'],
  SK:['Slovakia','STVR, TV JOJ','mixed'], SI:['Slovenia','Arena Sport','paid'],
  ZA:['South Africa','SABC (free), SuperSport on DStv (paid)','mixed'],
  KR:['South Korea','JTBC, NAVER Sports, CHZZK','mixed'],
  ES:['Spain','RTVE (free), Mediapro & DAZN (all 104, paid)','mixed'], SE:['Sweden','SVT, TV4','mixed'],
  CH:['Switzerland','SRG SSR','free'], TW:['Taiwan','ELTA Sports, EBC, TTV, Hami Video','mixed'],
  TJ:['Tajikistan','Varzish TV, TV Football','free'], TL:['Timor-Leste','ETO','free'],
  TR:['Türkiye','TRT','free'], TM:['Turkmenistan','Turkmenistan Sport','free'],
  GB:['United Kingdom','BBC, ITV','free'],
  US:['United States','FOX & FS1 (English), Telemundo & Universo (Spanish)','mixed'],
  UY:['Uruguay','Canal 5, Antel TV','free'], UZ:['Uzbekistan','Zo’r TV','free'],
  VA:['Vatican City','RAI, DAZN','mixed'], VE:['Venezuela','Televen','free'], VN:['Vietnam','FPT Telecom','mixed'],
};
// MENA: one beIN Sports deal covers 24 territories (paid)
'SA AE QA KW BH OM YE IQ JO LB SY PS EG LY TN DZ MA SD SS MR DJ SO KM EH'.split(' ').forEach(cc => {
  const names = { SA:'Saudi Arabia',AE:'United Arab Emirates',QA:'Qatar',KW:'Kuwait',BH:'Bahrain',OM:'Oman',
    YE:'Yemen',IQ:'Iraq',JO:'Jordan',LB:'Lebanon',SY:'Syria',PS:'Palestine',EG:'Egypt',LY:'Libya',TN:'Tunisia',
    DZ:'Algeria',MA:'Morocco',SD:'Sudan',SS:'South Sudan',MR:'Mauritania',DJ:'Djibouti',SO:'Somalia',
    KM:'Comoros',EH:'Western Sahara' };
  B[cc] = [names[cc], 'beIN Sports', 'paid'];
});
// Confirmed-pending territories (no FIFA-licensed broadcaster as of May 2026)
const UNCONFIRMED = { IN:'India', BD:'Bangladesh', PK:'Pakistan', LK:'Sri Lanka', BT:'Bhutan' };

function json(obj, sMax) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, s-maxage=${sMax}, max-age=300` },
  });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cc = ((request.headers.get('CF-IPCountry')) || (request.cf && request.cf.country) || '').toUpperCase();

  if (url.searchParams.get('all')) {
    const list = Object.keys(B).map(k => ({ cc: k, name: B[k][0], b: B[k][1], t: B[k][2] }))
      .concat(Object.keys(UNCONFIRMED).map(k => ({ cc: k, name: UNCONFIRMED[k], b: null, t: 'unconfirmed' })))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ countries: list }, 86400);
  }

  if (!cc || cc === 'XX' || cc === 'T1') return json({ country: null }, 3600);
  if (UNCONFIRMED[cc]) return json({ country: cc, name: UNCONFIRMED[cc], b: null, t: 'unconfirmed' }, 3600);
  const e = B[cc];
  if (!e) return json({ country: cc, name: null, b: null, t: null }, 3600);   // detected but not in table
  return json({ country: cc, name: e[0], b: e[1], t: e[2] }, 3600);
}
