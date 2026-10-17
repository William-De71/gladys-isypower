# Isypower

## Presentación

Esta integración trae su instalación **Isypower Cloud** (Materfrance, antes Izypower) a Gladys: producción solar, consumo de la casa, energía comprada y vendida a la red, y sus baterías domésticas. Lee la misma nube que la aplicación móvil Isypower Cloud, con su cuenta.

- Un dispositivo por **instalación**: producción, consumo, intercambio con la red, nivel y potencias de las baterías, e **índices de energía** acumulados que alimentan el seguimiento energético de Gladys (consumo, coste, producción).
- Un dispositivo por **batería**: nivel, energía almacenada, potencias de carga y descarga, temperatura, toma de emergencia, y su **modo de control** y su **modo manual** como listas desplegables.
- **Widgets del panel**, **disparadores** y **acciones de escena** (más abajo).

Integración comunitaria, ni desarrollada ni respaldada por Materfrance.

## Requisitos previos

- Gladys Assistant **5.2.0** o posterior.
- Una cuenta de Isypower Cloud (el correo y la contraseña de la aplicación) con al menos una instalación.
- Acceso a internet desde Gladys: los datos vienen de la nube de Materfrance, nunca de la red local.

## Configuración

En **Integraciones → Isypower → Configuración**:

| Campo                | Descripción                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Correo electrónico   | El correo de su cuenta de Isypower Cloud.                                                                    |
| Contraseña           | Su contraseña, guardada como secreto: nunca se vuelve a mostrar ni se escribe en los registros.              |
| Leer cada            | 3 (por defecto), 5, 10 o 15 minutos. Las cajas envían sus datos cada 3 minutos: más a menudo no aporta nada. |
| Idioma de los textos | Nombres de los dispositivos, modos de las baterías, resúmenes de escenas. Automático: el idioma de su panel. |

Guarde: el estado muestra las instalaciones encontradas. Una contraseña incorrecta detiene las lecturas hasta que vuelva a guardar, para que su cuenta nunca se bloquee por intentos repetidos. Dos botones: **Leer ahora** y **Diagnóstico** (escribe lo leído en la pestaña Registros, sin la contraseña, el token ni los números de serie).

## Uso

### Dispositivos

Abra la pestaña **Descubrir** y cree los dispositivos que desee:

- **Isypower <instalación>**: producción solar (W) y su índice (kWh), consumo de la casa (W), intercambio con la red (W, positivo al comprar, negativo al vender), energía comprada a la red (kWh, usada por Gladys para el consumo y su coste), energía vendida a la red (kWh) y, con batería, el nivel de las baterías (%), las potencias (W) y los índices (kWh) de carga y descarga.
- **Isypower <batería>**: nivel de carga (%), energía almacenada (kWh), potencias de carga y descarga (W), temperatura (°C), potencia de la toma de emergencia (W). Una batería maestra o independiente tiene además dos listas desplegables: **modo de control** (inteligente, manual, calendario; el inteligente necesita el contador inteligente de Isypower) y **modo manual** (en espera, carga, descarga). Una batería esclava sigue a su maestra.

### Widgets del panel

![Los tres widgets: la instalación solar ahora con sus curvas, el balance energético del mes, una batería doméstica con sus botones (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-isypower/main/docs/assets/widgets.es.png)

- **Instalación solar**: producción, consumo, red y batería ahora, las curvas de producción y consumo de las últimas 24 horas (trazadas a partir de las lecturas de la integración), la energía del día y el último informe de la caja.
- **Balance energético**: energía producida, consumida, comprada y vendida y autosuficiencia, hoy, este mes, este año o desde la instalación.
- **Batería doméstica**: nivel, potencia, energía almacenada, temperatura y modos, con un botón **Cambiar modo** (modo de control, modo manual, potencia) y un botón **Carga mínima**.

### Escenas

Disparadores:

- **La batería empieza a cargar, a descargar o se detiene**, filtrado por batería y nuevo estado.
- **Un equipo se desconecta o vuelve** (microinversor, batería, contador, cargador).
- **Actualización de firmware disponible** (comprobada cada seis horas).
- **Instalación sin datos o de vuelta**: la caja no ha enviado nada a la nube desde hace 20 minutos.

Acciones:

- **Cambiar el modo de una batería**: modo de control, y en control manual espera, carga o descarga a una potencia dada.
- **Ajustar la carga mínima de una batería** (5 a 100 %).
- **Leer el balance energético** de un periodo: kWh producidos, consumidos, comprados, vendidos, almacenados y entregados, autosuficiencia, y un resumen listo para un mensaje.

Ejemplos:

- Cada noche a las 21 h, **leer el balance energético** del día y enviar su resumen por Telegram.
- Cuando la electricidad es cara (horas punta), **cambiar el modo de la batería** a descarga manual a 800 W; volver al calendario al final del periodo.
- Cuando un microinversor se **desconecta**, o la instalación queda **sin datos**, enviar una notificación.

### Transporte

Solo nube: la integración inicia sesión en Isypower Cloud (`application.izypowercloud.fr`) por internet, exactamente como la aplicación, y los datos salen de su red a través de esa nube. Gladys muestra la insignia **nube** en la integración.

## Solución de problemas

- **«Isypower Cloud ha rechazado el inicio de sesión»**: compruebe el correo y la contraseña en la aplicación y vuelva a guardar. La integración no lo reintenta por sí misma.
- **Ningún dispositivo en Descubrir**: pulse **Leer ahora** y mire el estado. Una instalación que la aplicación no muestra tampoco se lee.
- **Un valor queda vacío**: la nube no lo ha enviado (una instalación sin batería no tiene función de batería). Pulse **Diagnóstico** y adjunte a una incidencia las líneas que empiezan por «Isypower diagnostic».
- **La instalación no envía datos**: la caja informa cada tres minutos; compruebe su wifi y su alimentación.
- Incidencias: https://github.com/William-De71/gladys-isypower/issues, con las versiones de Gladys y de la integración y las líneas del diagnóstico. En modo desarrollador, `DEBUG=gladys-integration-sdk` añade los registros del SDK.
