# Isypower

## Présentation

Cette intégration amène votre installation **Isypower Cloud** (Materfrance, anciennement Izypower) dans Gladys : production solaire, consommation de la maison, énergie achetée et vendue au réseau, et vos batteries domestiques. Elle lit le même cloud que l’application mobile Isypower Cloud, avec votre compte.

- Un appareil par **centrale** : production, consommation, échange avec le réseau, niveau et puissances des batteries, et des **index d’énergie** cumulés qui alimentent le suivi d’énergie de Gladys (consommation, coût, production).
- Un appareil par **batterie** : niveau, énergie stockée, puissances de charge et de décharge, température, prise de secours, et son **mode de pilotage** et son **mode manuel** sous forme de listes déroulantes.
- Des **widgets de tableau de bord**, des **déclencheurs** et des **actions de scène** (ci-dessous).

Intégration communautaire, ni développée ni approuvée par Materfrance.

## Prérequis

- Gladys Assistant **5.2.0** ou plus récent.
- Un compte Isypower Cloud (l’e-mail et le mot de passe de l’application) avec au moins une centrale.
- Un accès à internet depuis Gladys : les données viennent du cloud de Materfrance, jamais du réseau local.

## Configuration

Dans **Intégrations → Isypower → Configuration** :

| Champ             | Description                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| E-mail            | L’e-mail de votre compte Isypower Cloud.                                                                         |
| Mot de passe      | Son mot de passe, stocké comme secret : jamais réaffiché, jamais écrit dans les journaux.                        |
| Lire toutes les   | 3 (par défaut), 5, 10 ou 15 minutes. Les boîtiers remontent toutes les 3 minutes : inutile de lire plus souvent. |
| Langue des textes | Noms des appareils, modes des batteries, résumés des scènes. Automatique : la langue de votre tableau de bord.   |

Enregistrez : le statut affiche les centrales trouvées. Un mauvais mot de passe arrête les lectures jusqu’au prochain enregistrement, pour que votre compte ne soit jamais bloqué par des essais répétés. Deux boutons : **Lire maintenant** et **Diagnostic** (écrit ce qui a été lu dans l’onglet Journaux, sans le mot de passe, le jeton ni les numéros de série).

## Utilisation

### Appareils

Ouvrez l’onglet **Découverte** et créez les appareils voulus :

- **Isypower <centrale>** : production solaire (W) et son index (kWh), consommation de la maison (W), échange avec le réseau (W, positif à l’achat, négatif à la vente), énergie achetée au réseau (kWh, utilisée par Gladys pour la consommation et son coût), énergie vendue au réseau (kWh) et, avec une batterie, le niveau des batteries (%), les puissances (W) et les index (kWh) de charge et de décharge.
- **Isypower <batterie>** : niveau de charge (%), énergie stockée (kWh), puissances de charge et de décharge (W), température (°C), puissance de la prise de secours (W). Une batterie maître ou autonome a aussi deux listes déroulantes : **mode de pilotage** (intelligent, manuel, calendrier ; l’intelligent demande le compteur intelligent Isypower) et **mode manuel** (veille, charge, décharge). Une batterie esclave suit sa maître.

### Widgets du tableau de bord

![Les trois widgets : l’installation solaire en ce moment avec ses courbes, le bilan énergétique du mois, une batterie domestique avec ses boutons (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-isypower/main/docs/assets/widgets.fr.png)

- **Installation solaire** : production, consommation, réseau et batterie en ce moment, les courbes de production et de consommation des dernières 24 heures (tracées à partir des lectures de l’intégration), l’énergie du jour et le dernier relevé du boîtier.
- **Bilan énergétique** : énergie produite, consommée, achetée et vendue et autonomie, aujourd’hui, ce mois-ci, cette année ou depuis l’installation.
- **Batterie domestique** : niveau, puissance, énergie stockée, température et modes, avec un bouton **Changer de mode** (mode de pilotage, mode manuel, puissance) et un bouton **Charge minimale**.

### Scènes

Déclencheurs :

- **La batterie se charge, se décharge ou s’arrête**, filtré par batterie et nouvel état.
- **Un équipement est hors ligne ou revenu** (micro-onduleur, batterie, compteur, borne).
- **Mise à jour du firmware disponible** (vérifiée toutes les six heures).
- **Centrale muette ou de retour** : le boîtier n’a rien envoyé au cloud depuis 20 minutes.

Actions :

- **Changer le mode d’une batterie** : mode de pilotage, et en pilotage manuel veille, charge ou décharge à une puissance donnée.
- **Régler la charge minimale d’une batterie** (5 à 100 %).
- **Lire le bilan énergétique** d’une période : kWh produits, consommés, achetés, vendus, stockés et restitués, autonomie, et un résumé prêt pour un message.

Exemples :

- Chaque soir à 21 h, **lire le bilan énergétique** du jour et envoyer son résumé sur Telegram.
- Quand l’électricité est chère (heures pleines), **changer le mode de la batterie** en décharge manuelle à 800 W ; retour au calendrier à la fin de la période.
- Quand un micro-onduleur passe **hors ligne**, ou que la centrale est **muette**, envoyer une notification.

### Transport

Cloud uniquement : l’intégration se connecte à Isypower Cloud (`application.izypowercloud.fr`) par internet, exactement comme l’application, et les données quittent votre réseau par ce cloud. Gladys affiche le badge **cloud** sur l’intégration.

## Dépannage

- **« Isypower Cloud a refusé la connexion »** : vérifiez l’e-mail et le mot de passe dans l’application, puis enregistrez à nouveau. L’intégration ne réessaie pas d’elle-même.
- **Aucun appareil dans Découverte** : appuyez sur **Lire maintenant**, puis regardez le statut. Une centrale que l’application n’affiche pas n’est pas lue non plus.
- **Une valeur reste vide** : le cloud ne l’a pas envoyée (une centrale sans batterie n’a pas de fonctionnalité batterie). Appuyez sur **Diagnostic** et joignez les lignes commençant par « Isypower diagnostic » à un ticket.
- **La centrale est muette** : le boîtier remonte toutes les trois minutes ; vérifiez son Wi-Fi et son alimentation.
- Tickets : https://github.com/William-De71/gladys-isypower/issues, avec les versions de Gladys et de l’intégration et les lignes du diagnostic. En mode développeur, `DEBUG=gladys-integration-sdk` ajoute les journaux du SDK.
