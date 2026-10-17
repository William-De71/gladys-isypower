// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene action summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo, scène / Szene / escena) and of the
// Isypower application (centrale, batterie, autoconsommation, autonomie).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  stationName: {
    en: 'Isypower {name}',
    fr: 'Isypower {name}',
    de: 'Isypower {name}',
    es: 'Isypower {name}',
  },
  batteryName: {
    en: 'Isypower {name}',
    fr: 'Isypower {name}',
    de: 'Isypower {name}',
    es: 'Isypower {name}',
  },
  feature_production_power: {
    en: 'Solar production',
    fr: 'Production solaire',
    de: 'Solarerzeugung',
    es: 'Producción solar',
  },
  feature_production_index: {
    en: 'Solar production index',
    fr: 'Index de production solaire',
    de: 'Zählerstand Solarerzeugung',
    es: 'Índice de producción solar',
  },
  feature_consumption_power: {
    en: 'House consumption',
    fr: 'Consommation de la maison',
    de: 'Hausverbrauch',
    es: 'Consumo de la casa',
  },
  feature_grid_power: {
    en: 'Grid exchange',
    fr: 'Échange avec le réseau',
    de: 'Netzaustausch',
    es: 'Intercambio con la red',
  },
  feature_grid_import_index: {
    en: 'Energy bought from the grid',
    fr: 'Énergie achetée au réseau',
    de: 'Aus dem Netz bezogene Energie',
    es: 'Energía comprada a la red',
  },
  feature_grid_export_index: {
    en: 'Energy sold to the grid',
    fr: 'Énergie vendue au réseau',
    de: 'Ins Netz eingespeiste Energie',
    es: 'Energía vendida a la red',
  },
  feature_battery_level: {
    en: 'Battery level',
    fr: 'Niveau des batteries',
    de: 'Batteriestand',
    es: 'Nivel de las baterías',
  },
  feature_battery_charge_power: {
    en: 'Battery charging',
    fr: 'Charge des batteries',
    de: 'Batterieladung',
    es: 'Carga de las baterías',
  },
  feature_battery_discharge_power: {
    en: 'Battery discharging',
    fr: 'Décharge des batteries',
    de: 'Batterieentladung',
    es: 'Descarga de las baterías',
  },
  feature_battery_charge_index: {
    en: 'Energy stored in the batteries',
    fr: 'Énergie stockée dans les batteries',
    de: 'In die Batterien geladene Energie',
    es: 'Energía almacenada en las baterías',
  },
  feature_battery_discharge_index: {
    en: 'Energy drawn from the batteries',
    fr: 'Énergie restituée par les batteries',
    de: 'Aus den Batterien entnommene Energie',
    es: 'Energía entregada por las baterías',
  },
  feature_level: {
    en: 'Charge level',
    fr: 'Niveau de charge',
    de: 'Ladestand',
    es: 'Nivel de carga',
  },
  feature_energy: {
    en: 'Stored energy',
    fr: 'Énergie stockée',
    de: 'Gespeicherte Energie',
    es: 'Energía almacenada',
  },
  feature_charge_power: {
    en: 'Charging power',
    fr: 'Puissance de charge',
    de: 'Ladeleistung',
    es: 'Potencia de carga',
  },
  feature_discharge_power: {
    en: 'Discharging power',
    fr: 'Puissance de décharge',
    de: 'Entladeleistung',
    es: 'Potencia de descarga',
  },
  feature_temperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  feature_off_grid_power: {
    en: 'Backup outlet',
    fr: 'Prise de secours',
    de: 'Notstromsteckdose',
    es: 'Toma de emergencia',
  },
  feature_control_mode: {
    en: 'Control mode',
    fr: 'Mode de pilotage',
    de: 'Steuermodus',
    es: 'Modo de control',
  },
  feature_manual_mode: {
    en: 'Manual mode',
    fr: 'Mode manuel',
    de: 'Manueller Modus',
    es: 'Modo manual',
  },
  // modes and states
  mode_intelligent: { en: 'Intelligent', fr: 'Intelligent', de: 'Intelligent', es: 'Inteligente' },
  mode_manual: { en: 'Manual', fr: 'Manuel', de: 'Manuell', es: 'Manual' },
  mode_calendar: { en: 'Calendar', fr: 'Calendrier', de: 'Zeitplan', es: 'Calendario' },
  mode_standby: { en: 'Standby', fr: 'Veille', de: 'Standby', es: 'En espera' },
  mode_charge: { en: 'Charge', fr: 'Charge', de: 'Laden', es: 'Carga' },
  mode_discharge: { en: 'Discharge', fr: 'Décharge', de: 'Entladen', es: 'Descarga' },
  state_charging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  state_discharging: { en: 'Discharging', fr: 'En décharge', de: 'Entlädt', es: 'Descargando' },
  state_standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En espera' },
  equipment_other: { en: 'Equipment', fr: 'Équipement', de: 'Gerät', es: 'Equipo' },
  // periods
  period_day: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  period_month: { en: 'This month', fr: 'Ce mois-ci', de: 'Dieser Monat', es: 'Este mes' },
  period_year: { en: 'This year', fr: 'Cette année', de: 'Dieses Jahr', es: 'Este año' },
  period_all: {
    en: 'Since installation',
    fr: 'Depuis l’installation',
    de: 'Seit Installation',
    es: 'Desde la instalación',
  },
  // widgets
  widget_production: { en: 'Production', fr: 'Production', de: 'Erzeugung', es: 'Producción' },
  widget_consumption: { en: 'Consumption', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
  widget_grid_import: {
    en: 'From the grid',
    fr: 'Depuis le réseau',
    de: 'Aus dem Netz',
    es: 'De la red',
  },
  widget_grid_export: { en: 'To the grid', fr: 'Vers le réseau', de: 'Ins Netz', es: 'A la red' },
  widget_battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  widget_series_production: {
    en: 'Production',
    fr: 'Production',
    de: 'Erzeugung',
    es: 'Producción',
  },
  widget_series_consumption: {
    en: 'Consumption',
    fr: 'Consommation',
    de: 'Verbrauch',
    es: 'Consumo',
  },
  widget_today_production: {
    en: 'Produced today',
    fr: 'Produit aujourd’hui',
    de: 'Heute erzeugt',
    es: 'Producido hoy',
  },
  widget_today_consumption: {
    en: 'Consumed today',
    fr: 'Consommé aujourd’hui',
    de: 'Heute verbraucht',
    es: 'Consumido hoy',
  },
  widget_today_import: {
    en: 'Bought today',
    fr: 'Acheté aujourd’hui',
    de: 'Heute bezogen',
    es: 'Comprado hoy',
  },
  widget_today_export: {
    en: 'Sold today',
    fr: 'Vendu aujourd’hui',
    de: 'Heute eingespeist',
    es: 'Vendido hoy',
  },
  widget_self_sufficiency: {
    en: 'Self-sufficiency',
    fr: 'Autonomie',
    de: 'Autarkie',
    es: 'Autosuficiencia',
  },
  widget_self_consumed: {
    en: 'Solar energy used',
    fr: 'Solaire autoconsommé',
    de: 'Selbst genutzter Solarstrom',
    es: 'Solar autoconsumido',
  },
  widget_self_consumption_rate: {
    en: 'Self-consumption rate',
    fr: 'Taux d’autoconsommation',
    de: 'Eigenverbrauchsquote',
    es: 'Tasa de autoconsumo',
  },
  widget_bought: { en: 'Bought', fr: 'Acheté', de: 'Bezogen', es: 'Comprado' },
  widget_sold: { en: 'Sold', fr: 'Vendu', de: 'Eingespeist', es: 'Vendido' },
  widget_battery_charged: {
    en: 'Stored in batteries',
    fr: 'Stocké en batterie',
    de: 'In Batterien geladen',
    es: 'Almacenado en baterías',
  },
  widget_battery_discharged: {
    en: 'Drawn from batteries',
    fr: 'Restitué par les batteries',
    de: 'Aus Batterien entnommen',
    es: 'Entregado por las baterías',
  },
  widget_last_report: {
    en: 'Last report of the box',
    fr: 'Dernier relevé du boîtier',
    de: 'Letzte Meldung der Box',
    es: 'Último informe de la caja',
  },
  widget_level: {
    en: 'Charge level',
    fr: 'Niveau de charge',
    de: 'Ladestand',
    es: 'Nivel de carga',
  },
  widget_charge: { en: 'Charging', fr: 'Charge', de: 'Laden', es: 'Carga' },
  widget_discharge: { en: 'Discharging', fr: 'Décharge', de: 'Entladen', es: 'Descarga' },
  widget_stored: { en: 'Stored', fr: 'Stockée', de: 'Gespeichert', es: 'Almacenada' },
  widget_temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  widget_state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  widget_control_mode: {
    en: 'Control mode',
    fr: 'Mode de pilotage',
    de: 'Steuermodus',
    es: 'Modo de control',
  },
  widget_manual_mode: {
    en: 'Manual mode',
    fr: 'Mode manuel',
    de: 'Manueller Modus',
    es: 'Modo manual',
  },
  widget_minimum_charge: {
    en: 'Minimum charge',
    fr: 'Charge minimale',
    de: 'Mindestladung',
    es: 'Carga mínima',
  },
  widget_modules: { en: 'Modules', fr: 'Modules', de: 'Module', es: 'Módulos' },
  widget_button_mode: {
    en: 'Change mode',
    fr: 'Changer de mode',
    de: 'Modus ändern',
    es: 'Cambiar modo',
  },
  widget_button_minimum: {
    en: 'Minimum charge',
    fr: 'Charge minimale',
    de: 'Mindestladung',
    es: 'Carga mínima',
  },
  field_control_mode: {
    en: 'Control mode',
    fr: 'Mode de pilotage',
    de: 'Steuermodus',
    es: 'Modo de control',
  },
  field_manual_mode: {
    en: 'Manual mode',
    fr: 'Mode manuel',
    de: 'Manueller Modus',
    es: 'Modo manual',
  },
  field_manual_mode_description: {
    en: 'Used with the manual control mode only.',
    fr: 'Utilisé seulement avec le pilotage manuel.',
    de: 'Nur im manuellen Steuermodus verwendet.',
    es: 'Solo se usa con el control manual.',
  },
  field_power: { en: 'Power (W)', fr: 'Puissance (W)', de: 'Leistung (W)', es: 'Potencia (W)' },
  field_power_description: {
    en: 'Charge or discharge power in manual mode. Empty: the current one.',
    fr: 'Puissance de charge ou de décharge en mode manuel. Vide : celle en cours.',
    de: 'Lade- oder Entladeleistung im manuellen Modus. Leer: die aktuelle.',
    es: 'Potencia de carga o descarga en modo manual. Vacío: la actual.',
  },
  field_minimum_charge: {
    en: 'Minimum charge (%)',
    fr: 'Charge minimale (%)',
    de: 'Mindestladung (%)',
    es: 'Carga mínima (%)',
  },
  field_minimum_charge_description: {
    en: 'The battery does not discharge below this level (5 to 100 %, by steps of 5).',
    fr: 'La batterie ne se décharge pas sous ce niveau (5 à 100 %, par pas de 5).',
    de: 'Die Batterie entlädt sich nicht unter diesen Stand (5 bis 100 %, in 5er-Schritten).',
    es: 'La batería no se descarga por debajo de este nivel (5 a 100 %, de 5 en 5).',
  },
  widgetNoStation: {
    en: 'No Isypower station yet: check the account in the Configuration tab of the integration.',
    fr: 'Aucune centrale Isypower pour l’instant : vérifiez le compte dans l’onglet Configuration de l’intégration.',
    de: 'Noch keine Isypower-Anlage: Prüfen Sie das Konto im Reiter Konfiguration der Integration.',
    es: 'Todavía no hay ninguna instalación Isypower: compruebe la cuenta en la pestaña Configuración de la integración.',
  },
  widgetNoBattery: {
    en: 'No Isypower battery found on this account.',
    fr: 'Aucune batterie Isypower trouvée sur ce compte.',
    de: 'Keine Isypower-Batterie in diesem Konto gefunden.',
    es: 'No se ha encontrado ninguna batería Isypower en esta cuenta.',
  },
  widgetNotRead: {
    en: 'Waiting for the first reading of Isypower Cloud…',
    fr: 'En attente de la première lecture d’Isypower Cloud…',
    de: 'Warten auf die erste Abfrage von Isypower Cloud…',
    es: 'Esperando la primera lectura de Isypower Cloud…',
  },
  widgetReportError: {
    en: 'The report of Isypower Cloud could not be read: {detail}',
    fr: 'Le bilan d’Isypower Cloud n’a pas pu être lu : {detail}',
    de: 'Der Bericht von Isypower Cloud konnte nicht gelesen werden: {detail}',
    es: 'No se pudo leer el informe de Isypower Cloud: {detail}',
  },
  // widget toasts
  toastModeDone: {
    en: 'Mode sent to {name}: {mode}.',
    fr: 'Mode envoyé à {name} : {mode}.',
    de: 'Modus an {name} gesendet: {mode}.',
    es: 'Modo enviado a {name}: {mode}.',
  },
  toastMinimumDone: {
    en: 'Minimum charge of {name}: {level} %.',
    fr: 'Charge minimale de {name} : {level} %.',
    de: 'Mindestladung von {name}: {level} %.',
    es: 'Carga mínima de {name}: {level} %.',
  },
  toastFailed: {
    en: 'Isypower Cloud refused: {detail}',
    fr: 'Isypower Cloud a refusé : {detail}',
    de: 'Isypower Cloud hat abgelehnt: {detail}',
    es: 'Isypower Cloud lo ha rechazado: {detail}',
  },
  toastUnknownBattery: {
    en: 'This battery is no longer on the account.',
    fr: 'Cette batterie n’est plus sur le compte.',
    de: 'Diese Batterie ist nicht mehr im Konto.',
    es: 'Esta batería ya no está en la cuenta.',
  },
  toastNoModes: {
    en: 'This battery follows its master battery: change the mode on the master.',
    fr: 'Cette batterie suit sa batterie maître : changez le mode sur la maître.',
    de: 'Diese Batterie folgt ihrer Master-Batterie: Ändern Sie den Modus an der Master-Batterie.',
    es: 'Esta batería sigue a su batería maestra: cambie el modo en la maestra.',
  },
  toastNoMeter: {
    en: 'The intelligent mode needs the smart meter of Isypower.',
    fr: 'Le mode intelligent demande le compteur intelligent d’Isypower.',
    de: 'Der intelligente Modus erfordert den intelligenten Zähler von Isypower.',
    es: 'El modo inteligente necesita el contador inteligente de Isypower.',
  },
  // scene action summary
  reportSummary: {
    en: '{station}, {period}: {production} produced, {consumption} consumed, {bought} bought, {sold} sold, self-sufficiency {selfSufficiency}.',
    fr: '{station}, {period} : {production} produits, {consumption} consommés, {bought} achetés, {sold} vendus, autonomie {selfSufficiency}.',
    de: '{station}, {period}: {production} erzeugt, {consumption} verbraucht, {bought} bezogen, {sold} eingespeist, Autarkie {selfSufficiency}.',
    es: '{station}, {period}: {production} producidos, {consumption} consumidos, {bought} comprados, {sold} vendidos, autosuficiencia {selfSufficiency}.',
  },
  // Configuration screen
  noAccount: {
    en: 'Enter the e-mail and the password of your Isypower Cloud account, then save.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Isypower Cloud, puis enregistrez.',
    de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres Isypower-Cloud-Kontos ein und speichern Sie.',
    es: 'Introduzca el correo y la contraseña de su cuenta de Isypower Cloud y guarde.',
  },
  statusConnected: {
    en: 'Connected to Isypower Cloud: {stations}. Reading every {interval} min.',
    fr: 'Connecté à Isypower Cloud : {stations}. Lecture toutes les {interval} min.',
    de: 'Mit Isypower Cloud verbunden: {stations}. Abfrage alle {interval} Min.',
    es: 'Conectado a Isypower Cloud: {stations}. Lectura cada {interval} min.',
  },
  statusStation: {
    en: '{name} ({batteries} battery(ies))',
    fr: '{name} ({batteries} batterie(s))',
    de: '{name} ({batteries} Batterie(n))',
    es: '{name} ({batteries} batería(s))',
  },
  statusNoStation: {
    en: 'Connected to Isypower Cloud, but the account holds no station.',
    fr: 'Connecté à Isypower Cloud, mais le compte ne contient aucune centrale.',
    de: 'Mit Isypower Cloud verbunden, aber das Konto enthält keine Anlage.',
    es: 'Conectado a Isypower Cloud, pero la cuenta no contiene ninguna instalación.',
  },
  statusAuth: {
    en: 'Isypower Cloud refused the login: {detail}. Check the e-mail and the password, then save (no new try before that, so that the account is not locked).',
    fr: 'Isypower Cloud a refusé la connexion : {detail}. Vérifiez l’e-mail et le mot de passe, puis enregistrez (aucun nouvel essai d’ici là, pour ne pas bloquer le compte).',
    de: 'Isypower Cloud hat die Anmeldung abgelehnt: {detail}. Prüfen Sie E-Mail und Passwort und speichern Sie (bis dahin kein neuer Versuch, damit das Konto nicht gesperrt wird).',
    es: 'Isypower Cloud ha rechazado el inicio de sesión: {detail}. Compruebe el correo y la contraseña y guarde (no habrá nuevo intento hasta entonces, para no bloquear la cuenta).',
  },
  statusUnreachable: {
    en: 'Isypower Cloud cannot be reached ({detail}). Next try in {minutes} min.',
    fr: 'Isypower Cloud est injoignable ({detail}). Nouvel essai dans {minutes} min.',
    de: 'Isypower Cloud ist nicht erreichbar ({detail}). Neuer Versuch in {minutes} Min.',
    es: 'No se puede acceder a Isypower Cloud ({detail}). Nuevo intento en {minutes} min.',
  },
  statusRefused: {
    en: 'Isypower Cloud answered with an error ({detail}). Next try in {minutes} min.',
    fr: 'Isypower Cloud a répondu par une erreur ({detail}). Nouvel essai dans {minutes} min.',
    de: 'Isypower Cloud hat mit einem Fehler geantwortet ({detail}). Neuer Versuch in {minutes} Min.',
    es: 'Isypower Cloud ha respondido con un error ({detail}). Nuevo intento en {minutes} min.',
  },
  refreshDone: {
    en: 'Read: {stations}.',
    fr: 'Lu : {stations}.',
    de: 'Gelesen: {stations}.',
    es: 'Leído: {stations}.',
  },
  refreshTooSoon: {
    en: 'Already read {seconds} s ago: wait a minute between two readings.',
    fr: 'Déjà lu il y a {seconds} s : attendez une minute entre deux lectures.',
    de: 'Bereits vor {seconds} s gelesen: Warten Sie eine Minute zwischen zwei Abfragen.',
    es: 'Ya leído hace {seconds} s: espere un minuto entre dos lecturas.',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the logs of the integration in {count} part(s), without the password nor the token.',
    fr: 'Diagnostic écrit dans les journaux de l’intégration en {count} partie(s), sans le mot de passe ni le jeton.',
    de: 'Diagnose in {count} Teil(en) in die Protokolle der Integration geschrieben, ohne Passwort und Token.',
    es: 'Diagnóstico escrito en los registros de la integración en {count} parte(s), sin la contraseña ni el token.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('stationName', 'fr', { name: 'Maison' }); // -> 'Isypower Maison'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object|Function} [values] - The substitutions, or `(language) => values`.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

const locale = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A number the way a language writes it.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - Maximum fraction digits.
 * @returns {string} The text.
 */
const formatNumber = (value, language, digits) =>
  new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);

/**
 * @description An energy ("12,4 kWh", "1,2 MWh").
 * @param {number|null} kwh - The energy.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function formatEnergy(kwh, language) {
  if (kwh === null || kwh === undefined || !Number.isFinite(kwh)) {
    return '';
  }
  if (Math.abs(kwh) >= 10000) {
    return `${formatNumber(kwh / 1000, language, 1)} MWh`;
  }
  return `${formatNumber(kwh, language, Math.abs(kwh) < 100 ? 1 : 0)} kWh`;
}

/**
 * @description A power ("850 W", "3,2 kW").
 * @param {number|null} watts - The power.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function formatPower(watts, language) {
  if (watts === null || watts === undefined || !Number.isFinite(watts)) {
    return '';
  }
  if (Math.abs(watts) >= 10000) {
    return `${formatNumber(watts / 1000, language, 1)} kW`;
  }
  return `${formatNumber(Math.round(watts), language, 0)} W`;
}

/**
 * @description A percentage ("85 %", "85%" in English).
 * @param {number|null} value - The percentage.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function formatPercent(value, language) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }
  return `${formatNumber(value, language, 0)}${language === 'en' ? '' : ' '}%`;
}

/**
 * @description An instant written the short way of a language ("16/10 13:12").
 * @param {number} instant - The instant, in ms.
 * @param {string} language - The language.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The text.
 */
function shortDateTime(instant, language, timeZone = process.env.TZ || undefined) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

export {
  LANGUAGES,
  TEXTS,
  isLanguage,
  t,
  all,
  formatEnergy,
  formatPower,
  formatPercent,
  shortDateTime,
};
