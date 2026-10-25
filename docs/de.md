# Isypower

## Überblick

Diese Integration bringt Ihre **Isypower-Cloud**-Anlage (Materfrance, früher Izypower) in Gladys: Solarerzeugung, Hausverbrauch, aus dem Netz bezogene und eingespeiste Energie sowie Ihre Heimspeicher. Sie liest dieselbe Cloud wie die mobile App Isypower Cloud, mit Ihrem Konto.

- Ein Gerät pro **Anlage**: Erzeugung, Verbrauch, Netzaustausch, Batteriestand und -leistungen sowie kumulierte **Energiezählerstände**, die die Energieauswertung von Gladys speisen (Verbrauch, Kosten, Erzeugung).
- Ein Gerät pro **Batterie**: Ladestand, gespeicherte Energie, Lade- und Entladeleistung, Temperatur, Notstromsteckdose sowie ihr **Steuermodus** und ihr **manueller Modus** als Auswahllisten.
- **Dashboard-Widgets**, **Szenen-Auslöser** und **Szenen-Aktionen** (siehe unten).

Community-Integration, weder von Materfrance entwickelt noch unterstützt.

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Ein Isypower-Cloud-Konto (E-Mail-Adresse und Passwort der App) mit mindestens einer Anlage.
- Internetzugang für Gladys: Die Daten kommen aus der Cloud von Materfrance, nie aus dem lokalen Netz.

## Konfiguration

Unter **Integrationen → Isypower → Konfiguration**:

| Feld              | Beschreibung                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| E-Mail            | Die E-Mail-Adresse Ihres Isypower-Cloud-Kontos.                                                    |
| Passwort          | Sein Passwort, als Geheimnis gespeichert: nie wieder angezeigt, nie in die Protokolle geschrieben. |
| Abfrage alle      | 3 (Standard), 5, 10 oder 15 Minuten. Die Boxen melden alle 3 Minuten: Häufiger bringt nichts.      |
| Sprache der Texte | Gerätenamen, Batteriemodi, Szenen-Zusammenfassungen. Automatisch: die Sprache Ihres Dashboards.    |

Speichern: Der Status zeigt die gefundenen Anlagen. Ein falsches Passwort stoppt die Abfragen bis zum nächsten Speichern, damit Ihr Konto nie durch wiederholte Versuche gesperrt wird. Zwei Schaltflächen: **Jetzt lesen** und **Diagnose** (schreibt das Gelesene in den Reiter Protokolle, ohne Passwort, Token und Seriennummern).

## Verwendung

### Geräte

Öffnen Sie den Reiter **Entdecken** und legen Sie die gewünschten Geräte an:

- **Isypower <Anlage>**: Solarerzeugung (W) und ihr Zählerstand (kWh), Hausverbrauch (W), Netzaustausch (W, positiv beim Bezug, negativ bei der Einspeisung), aus dem Netz bezogene Energie (kWh, von Gladys für Verbrauch und Kosten genutzt), eingespeiste Energie (kWh) und mit Batterie der Batteriestand (%), die Lade- und Entladeleistungen (W) und -zählerstände (kWh).
- **Isypower <Batterie>**: Ladestand (%), gespeicherte Energie (kWh), Lade- und Entladeleistung (W), Temperatur (°C), Leistung der Notstromsteckdose (W). Eine Master- oder Einzelbatterie hat außerdem zwei Auswahllisten: **Steuermodus** (intelligent, manuell, Zeitplan; intelligent erfordert den intelligenten Zähler von Isypower) und **manueller Modus** (Standby, Laden, Entladen). Eine Slave-Batterie folgt ihrer Master-Batterie.

### Dashboard-Widgets

![Die drei Widgets: die Solaranlage jetzt mit ihren Kurven, die Energiebilanz des Monats, ein Heimspeicher mit seinen Schaltflächen (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-isypower/main/docs/assets/widgets.de.png)

- **Solaranlage**: Erzeugung, Verbrauch, Netz und Batterie jetzt, die Erzeugungs- und Verbrauchskurven der letzten 24 Stunden (aus den Abfragen der Integration), die Energie des Tages und die letzte Meldung der Box.
- **Energiebilanz**: erzeugte, verbrauchte, bezogene und eingespeiste Energie sowie Autarkie, heute, diesen Monat, dieses Jahr oder seit der Installation.
- **Heimspeicher**: Ladestand, Leistung, gespeicherte Energie, Temperatur und Modi, mit einer Schaltfläche **Modus ändern** (Steuermodus, manueller Modus, Leistung) und einer Schaltfläche **Mindestladung**.

### Szenen

Auslöser:

- **Batterie beginnt zu laden, zu entladen oder stoppt**, gefiltert nach Batterie und neuem Zustand.
- **Gerät offline oder wieder online** (Mikrowechselrichter, Batterie, Zähler, Ladestation).
- **Firmware-Update verfügbar** (alle sechs Stunden geprüft).
- **Anlage stumm oder meldet wieder**: Die Box hat seit 20 Minuten nichts an die Cloud gesendet.

Aktionen:

- **Modus einer Batterie ändern**: Steuermodus, und manuell Standby, Laden oder Entladen mit einer bestimmten Leistung.
- **Mindestladung einer Batterie einstellen** (5 bis 100 %).
- **Energiebilanz lesen** für einen Zeitraum: erzeugte, verbrauchte, bezogene, eingespeiste, geladene und entnommene kWh, Autarkie und eine fertige Zusammenfassung für eine Nachricht.

Beispiele:

- Jeden Abend um 21 Uhr die **Energiebilanz** des Tages lesen und ihre Zusammenfassung per Telegram senden.
- Wenn der Strom teuer ist (Hochtarif), den **Batteriemodus** auf manuelles Entladen mit 800 W setzen; am Ende des Zeitraums zurück auf Zeitplan.
- Wenn ein Mikrowechselrichter **offline** geht oder die Anlage **stumm** ist, eine Benachrichtigung senden.

### Transport

Nur Cloud: Die Integration meldet sich wie die App über das Internet bei Isypower Cloud (`application.izypowercloud.fr`) an, und die Daten verlassen Ihr Netz über diese Cloud. Gladys zeigt das Abzeichen **Cloud** an der Integration.

## Fehlerbehebung

- **„Isypower Cloud hat die Anmeldung abgelehnt“**: Prüfen Sie E-Mail und Passwort in der App und speichern Sie erneut. Die Integration versucht es nicht von selbst erneut.
- **Kein Gerät unter Entdecken**: Drücken Sie **Jetzt lesen** und prüfen Sie den Status. Eine Anlage, die die App nicht zeigt, wird auch nicht gelesen.
- **Ein Wert bleibt leer**: Die Cloud hat ihn nicht gesendet (eine Anlage ohne Batterie hat keine Batteriefunktion). Drücken Sie **Diagnose** und hängen Sie die Zeilen, die mit „Isypower diagnostic“ beginnen, an ein Issue an.
- **Die Anlage ist stumm**: Die Box meldet alle drei Minuten; prüfen Sie ihr WLAN und ihre Stromversorgung.
- Issues: https://github.com/William-De71/gladys-isypower/issues, mit den Versionen von Gladys und der Integration und den Diagnosezeilen. Im Entwicklermodus fügt `DEBUG=gladys-integration-sdk` die SDK-Protokolle hinzu.
