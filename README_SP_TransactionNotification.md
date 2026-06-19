# README — `SBO_SP_TransactionNotification` (SAP Business One 10.0.1)

> Base de datos: **`SBO_COM_MIMBRAL`**
> Objeto: `dbo.SBO_SP_TransactionNotification`
> Propósito original: Facturación Electrónica (autor *VyV*, 2019), ampliado con integración OMS/Outbox y control de stock.

Este documento describe **cada punto de validación y lógica** que contiene el Stored Procedure, en el orden en que se ejecuta.

---

## 1. ¿Qué es este SP y cómo funciona?

`SBO_SP_TransactionNotification` es el procedimiento que **SAP Business One ejecuta automáticamente** cada vez que se agrega, actualiza, cancela o cierra un documento (el "Transaction Notification"). SAP lo invoca *antes de confirmar (commit)* la transacción; si el SP devuelve un `@error` distinto de `0`, **SAP aborta la operación** y muestra `@error_message` al usuario.

### Parámetros de entrada

| Parámetro | Tipo | Descripción |
|---|---|---|
| `@object_type` | `nvarchar(20)` | Tipo de objeto SBO (ej.: `13`=Factura, `4`=Artículo). |
| `@transaction_type` | `nchar(1)` | `A`=Add, `U`=Update, `D`=Delete, `C`=Cancel, `L`=Close. |
| `@num_of_cols_in_key` | `int` | Nº de columnas que forman la clave. |
| `@list_of_key_cols_tab_del` | `nvarchar(255)` | Nombres de columnas clave (separados por TAB). |
| `@list_of_cols_val_tab_del` | `nvarchar(255)` | Valores de la clave (separados por TAB). Normalmente el `DocEntry`. |

### Variables de salida

- `@error` → `0` significa "sin error" (continúa). Cualquier otro valor **bloquea** la operación.
- `@error_message` → texto mostrado al usuario (`N'Ok'` por defecto).

### Mecanismo de salida

Toda validación fallida hace `set @error`, `set @error_message` y `goto MensajeError`. La etiqueta `MensajeError:` al final ejecuta `select @error, @error_message`, devolviendo el resultado a SAP.

### Tipos de objeto (`@object_type`) referenciados en el SP

| Código | Objeto SAP | Tabla cabecera / detalle |
|---|---|---|
| `2`  | Socio de Negocios | OCRD / CRD1 |
| `4`  | Maestro de Artículos | OITM |
| `7`  | Desarrollos (Bill of Materials / dev) | — |
| `13` | Factura de Cliente / Boleta | OINV / INV1 / INV12 |
| `14` | Nota de Crédito Cliente | ORIN / RIN12 |
| `15` | Entrega (Guía de Despacho) | ODLN / DLN1 / DLN12 |
| `18` | Factura de Proveedor | OPCH / PCH1 |
| `20` | Entrada de Mercancía (Compra) | OPDN / PDN1 |
| `22` | Orden de Compra | OPOR / POR1 |
| `24` | Pago Recibido (Cobranza) | ORCT / RCT1 / RCT2 |
| `46` | Pago Efectuado (deshabilitado) | OVPM |
| `59` | Entrada de Mercancías (ajuste) | OIGN / IGN1 |
| `60` | Salida de Mercancías (ajuste) | OIGE / IGE1 |
| `67` | Transferencia de Stock | OWTR / WTR1 |

---

## 2. Bloque MAESTRO DE SOCIOS DE NEGOCIO (`@object_type = '2'`, `A`/`U`)

Se ejecuta al **crear o modificar un Socio de Negocio**. Lee de `OCRD`: RUT (`LicTradNum`), tipo (`CardType`), grupo (`GroupCode`), origen de datos (`DataSource`).

> **Nota sobre `DataSource`:** `O` = registro integrado vía DI API; `I` = interfaz/captura manual en SAP. Algunas validaciones de ciudad/comuna **solo aplican cuando `DataSource = 'I'`**.

### 2.1. Validación de RUT
- Llama a la función `dbo.BES_Validar_RUT(@LicTradNum)`. Si devuelve `<> 0`, el RUT es inválido.
- **Error:** `-1` → *"RUT Invalido para socio de negocios."*

### 2.2. Si es CLIENTE (`CardType = 'C'`)

| # | Validación | Condición | Mensaje |
|---|---|---|---|
| 1 | Dirección de Factura existe | No hay fila en CRD1 con `AdresType='B'` | *"Debe ingresar direccion de Factura"* |
| 2 | Ciudad dirección Factura | `City` vacío **y `DataSource='I'`** | *"Debe ingresar ciudad direccion de Factura"* |
| 3 | Comuna dirección Factura | `County` vacío **y `DataSource='I'`** | *"Debe ingresar comuna direccion de Factura"* |
| 4 | Dirección de Despacho existe | No hay fila en CRD1 con `AdresType='S'` | *"Debe usar direccion de Despacho"* |
| 5 | Ciudad dirección Despacho | `City` vacío **y `DataSource='I'`** | *"Debe ingresar ciudad direccion de Despacho"* |
| 6 | Comuna dirección Despacho | `County` vacío **y `DataSource='I'`** | *"Debe ingresar comuna direccion de Despacho"* |
| 7 | Giro obligatorio | `OCRD.Notes` vacío | *"Debe ingresar Giro"* |

Todas devuelven `@error = -1`. (`AdresType`: `B`=Bill To/Factura, `S`=Ship To/Despacho.)

### 2.3. Si es PROVEEDOR (`CardType = 'S'` y `GroupCode <> 104`)

Excluye al grupo 104 (Proveedores de Boleta de Honorarios). Valida (sin la condición `DataSource='I'`, es decir **siempre**):

| # | Validación | Mensaje |
|---|---|---|
| 1 | Dirección de Despacho existe (`AdresType='S'`) | *"Debe usar direccion de Despacho"* |
| 2 | Ciudad dirección Despacho no vacía | *"Debe ingresar ciudad direccion de Despacho"* |
| 3 | Comuna dirección Despacho no vacía | *"Debe ingresar comuna direccion de Despacho"* |
| 4 | Giro obligatorio (`OCRD.Notes`) | *"Debe ingresar Giro"* |

---

## 3. Bloque ORDEN DE COMPRA → OUTBOX (`@object_type = '22'`, `U`/`C`)

**No es una validación de bloqueo**, sino una **integración**: cuando una Orden de Compra se actualiza o cancela, inserta un evento en la tabla `Integration.IntegrationOutbox` para que un *worker* externo lo publique.

- Extrae el `DocEntry` del primer valor tab-delimited (`TRY_CAST`).
- Solo procede si el `DocEntry` es válido **y** existe la tabla `Integration.IntegrationOutbox`.
- Lee de `OPOR`: `DocNum`, `CardCode`, `CardName`, `DocDate`.
- Construye un **payload JSON** (`FOR JSON PATH`) con el evento `PurchaseOrder.Cancelled` (campo `canceled=1`; el worker valida `CANCELED='Y'` antes de publicar).
- **Idempotencia:** clave `B1-22-{DocEntry}-CANCELLED`. El `INSERT` usa `WHERE NOT EXISTS` para no duplicar (1 fila por `DocEntry`/`EventType`), con estado `PENDING`.

> Riesgo: la integración se ejecuta tanto en `U` como en `C`. El evento siempre se llama `Cancelled`, por lo que un simple Update también genera el evento de cancelación (se delega la validación final al worker).

---

## 4. Bloque PAGO RECIBIDO → OUTBOX (`@object_type = '24'`, `A`)

Otra **integración** (no bloqueante). Al agregar un Pago Recibido (`ORCT`), emite el evento `Payment.Received` al Outbox **solo si cumple reglas de negocio**. Usa una bandera `@orct_emit` (en vez de `RETURN`) que se va apagando si no corresponde emitir.

Condiciones para **emitir** el evento:
1. `DocEntry` válido y existe `Integration.IntegrationOutbox`.
2. El `DocNum` se pudo leer de `ORCT`.
3. El comentario **NO** contiene `OMS-SERVICE` (se excluyen pagos generados por el propio servicio OMS, para evitar bucles).
4. **Cumple una de dos** situaciones:
   - **Aplicado a factura cliente**: existe línea en `RCT2` con `InvType=13` (OINV) y la factura **no es boleta** (`DocSubType <> 'IB'`); **y** el pago es *posterior* a la factura más antigua aplicada (compara `CreateDate`/`CreateTS`: estrictamente mayor, o mismo día con TS mayor).
   - **Pago a cuenta** (`onAccount`): no existen líneas en `RCT2`.
   - Si no es ni aplicado ni a cuenta → no emite.

Detalles:
- Suma `amountTotal` = efectivo + cheque + transferencia + tarjeta (`CashSum + CheckSum + TrsfrSum + CreditSum`).
- Payload JSON con montos desglosados, `onAccount`, moneda (`DocCurr`, default `CLP`).
- **Idempotencia:** `B1-24-{DocEntry}-POSTED`, estado `PENDING`, con `WHERE NOT EXISTS`.
- El `INSERT` va dentro de `BEGIN TRY/CATCH` **vacío**: si falla, no rompe la transacción de SAP (la integración es best-effort).

---

## 5. Bloque REGISTRO DE MOVIMIENTOS DE STOCK → `Z_MovStockOMS` (`59,60,15,67,13,20`, `A`/`U`/`C`)

**Integración interna de stock.** Inserta filas en `dbo.Z_MovStockOMS` (estado `'pendiente'`, `Intentos=0`) para que OMS las procese. Toda la lógica va dentro de `TRY/CATCH`; si falla, setea `@error = 1` con *"Error al insertar en Z_MovStockOMS: …"*.

**Obtención del `DocEntry`:** primero busca la columna llamada `DocEntry` parseando los parámetros tab-delimited con `STRING_SPLIT`; si no la encuentra, toma el primer valor como fallback.

### 5.1. Adición / Actualización (`A`/`U`)

Cada tipo genera un código de movimiento distinto. Todos usan `NOT EXISTS` (anti-duplicado por DocEntry+ObjectType+ItemCode+WhsCode+Movimiento+Quantity) y resuelven el usuario vía `OUSR.USER_CODE`.

| ObjectType | Tabla | Movimiento | Notas |
|---|---|---|---|
| `59` OIGN | OIGN/IGN1 | `EM` (Entrada Mercancías) | |
| `20` OPDN | OPDN/PDN1 | `EP` (Entrada por Compra) | |
| `60` OIGE | OIGE/IGE1 | `SM` (Salida Mercancías) | |
| `15` ODLN | ODLN/DLN1 | `NE` normal / `Reversión Salida` si `CANCELED='C'` | Detecta cancelación con flag `@isCanceledDLN`. |
| `67` OWTR | OWTR/WTR1 | `TT` (Traslado) | Guarda almacén origen (`FromWhsCod`) y destino (`WhsCode`). |
| `13` OINV | OINV/INV1 | `Reserva` si `UpdInvnt='C'`; `RF` si `UpdInvnt IN ('Y','I')` | Solo facturas **no canceladas** (`CANCELED='N'`). |

### 5.2. Cancelación (`C`)

| ObjectType | Movimiento | Notas |
|---|---|---|
| `13` OINV (cancelada `CANCELED='C'`) | `Reversión Reserva` si `UpdInvnt='C'`; `EM` si `UpdInvnt IN ('Y','I')` | |
| `15` ODLN cancelada | `Reversión Salida` | |
| `67` OWTR cancelada | **Dos inserts**: `EM` al almacén origen (`FromWhsCod`) + `SM` al almacén destino (`WhsCode`) | Revierte el traslado. |

> Tras este bloque, si `@error <> 0` se hace `SELECT @error, @error_message` (pero la ejecución continúa hasta `MensajeError`).

---

## 6. Bloque FACTURACIÓN ELECTRÓNICA — Documentos (`13,14,15,67`, `A`/`U`)

Núcleo del control DTE (Documento Tributario Electrónico chileno). Solo actúa si `DataSource` es `'O'` (DI API) **o** `'I'` (interfaz SAP). Carga numerosas variables del documento: `DocSubType`, `LicTradNum` (RUT), `Series`, `Indicator`, giro/razón social del cliente, direcciones de factura/despacho (desde INV12/RIN12/DLN12), y datos de referencia para Notas de Crédito (`U_Fae_CodigoRef`, `U_Fae_TipoDRef`, `U_Fae_FechaRef`, `U_Fae_FolioRef`).

> **Comentado/Inactivo:** la validación de "folios disponibles" (NNM1) está deshabilitada ("YA NO APLICA PARA NUEVO ADDON DTE"). También está comentado el indicador obligatorio para Factura Electrónica `33` (object_type 13, DocSubType `--`).

### 6.1. Validaciones de INDICADOR según tipo de documento (DTE)

| Documento | Condición | Indicador permitido | Mensaje de error |
|---|---|---|---|
| Boleta Electrónica | `13` + `DocSubType='IB'` | `39,35,99,NT,DN` | *"El indicador debe ser 39 Boleta Electronica"* |
| Nota Débito Electrónica | `13` + `DocSubType='DN'` + `Series='81'` | `56,99` | *"El indicador debe ser 56 Nota Debito Electronica"* |
| Guía Despacho Electrónica | `15` + `DocSubType='--'` + `Series='83'` | `52,99` | *"El indicador debe ser 52 Guia Despacho Electronica"* |
| Factura Exenta Electrónica | `13` + `DocSubType='IE'` | `34,99` | *"El indicador debe ser 34 Factura Exenta Electronica"* |
| Nota Crédito Electrónica | `14` + `DocSubType='--'` + `Series='123'` | `61,99` | *"El indicador debe ser 61 Nota Credito Electronica"* |

### 6.2. Validación adicional Factura Exenta (`13` + `IE`)
- Además del indicador, fuerza que **todas las líneas** de `INV1` tengan `TaxCode = 'IVA_EXE'`. Si alguna línea tiene otro impuesto → *"El indicador de impuesto debe ser IVA_EXE."*

### 6.3. Datos de referencia obligatorios para Nota de Crédito (`14` + `Series='123'`)

| Campo faltante | Mensaje |
|---|---|
| Código de Referencia (`U_Fae_CodigoRef` vacío) | *"Falta indicar Codigo de Referencia"* |
| Tipo Documento Referencia (`U_Fae_TipoDRef` vacío) | *"Falta indicar Documento de Referencia"* |
| Folio Referencia (`U_Fae_FolioRef` vacío) | *"Falta indicar Folio de Referencia"* |
| Fecha Referencia (`U_Fae_FechaRef` = `01-01-1900`) | *"Falta indicar Fecha de Referencia"* |

### 6.4. Datos del cliente obligatorios (todos los documentos del bloque)

| Validación | Mensaje |
|---|---|
| Giro (`OCRD.Notes`) no vacío | *"Falta giro de socio de negocios"* |
| Razón social (`OCRD.CardName`) no vacía | *"Falta razon social de socio de negocios"* |

### 6.5. Validaciones de direcciones — **COMENTADAS / INACTIVAS**
El bloque que exigía dirección/comuna/ciudad de **factura y despacho** (excepto boletas `IB`) está **comentado** ("se comenta para integracion de RPRO JS"). Hoy **no** se valida la presencia de direcciones en el documento DTE. Mensajes que estaban definidos: *"No existe direccion de factura."*, *"No existe comuna de factura."*, *"No existe ciudad de factura."*, y los equivalentes de despacho.

---

## 7. Bloque ENTRADA DE MERCANCÍA — Compra (`@object_type = '20'`, `A`/`U`)

Valida la recepción de compras (`OPDN`):

| # | Validación | Detalle | Error / Mensaje |
|---|---|---|---|
| 1 | Fecha de vencimiento obligatoria | Artículos con `OITM.U_ValVcto='Y'` deben tener `PDN1.U_FVcto`. Toma el primer ítem incumplidor. | `-1` → *"SP: Registre fecha de vcto para articulo {ItemCode}"* |
| 2 | Folio obligatorio | `FolioNum = 0` y el `Indicator <> 'DN'` | `-1` → *"TNS: Debe registrar Folio de Documento"* |
| 3 | Indicador obligatorio | `Indicator` vacío (pestaña Finanzas) | `1803` → *"TNS: Indicador obligatorio, pestaña finanzas"* |
| 4 | Folio duplicado | Más de 1 OPDN con mismo `CardCode + FolioNum + Indicator` (e `Indicator <> 'DN'`) | `1801` → *"TNS:Folio duplicado"* |

> Comentado: validación de Código de Barra faltante en líneas.

---

## 8. Bloque MAESTRO DE ARTÍCULOS (`@object_type = '4'`, `A`/`U`)

El bloque más extenso. Valida la ficha del artículo (`OITM`) y, además, **registra variaciones de precio**. Carga: control de inventario (`InvntItem`), familia (`U_Nombre_Fam`), subfamilia (`U_Nombre_SubFam`), código de barra (`CodeBars`/`OBCD`), centro de costo (`U_CCosto`), grupo (`ItmsGrpCod`), sujeto a impuesto (`VATLiable`).

### 8.1. Validaciones de la ficha

| # | Condición | Error | Mensaje |
|---|---|---|---|
| 1 | Grupo `108` (Arriendo) **y** es inventariable (`InvntItem='Y'`) | `1708` | *"SP: Articulo de grupo Arriendo no debe ser inventariable"* |
| 2 | *(Si inventariable)* Familia vacía | `1701` | *"SP: Falta registrar familia"* |
| 3 | *(Si inventariable)* Familia ≠ primeros 3 caracteres del `ItemCode` (SKU) | `1702` | *"SP: Familia no corresponde a Codigo SKU"* |
| 4 | *(Si inventariable)* Subfamilia vacía | `1703` | *"SP: Falta registrar Subfamilia"* |
| 5 | *(Si inventariable)* Subfamilia ≠ primeros 6 caracteres del `ItemCode` | `1704` | *"SP: SubFamilia no corresponde a Familia seleccionada"* |
| 6 | *(Si inventariable)* Código de barra (`OITM.CodeBars`) duplicado | `1705` | *"SP: Codigo de barra duplicado"* |
| 7 | Centro de Costo (`U_CCosto`) vacío | `1707` | *"SP: Falta registrar Centro Costo"* |
| 8 | Sujeto a impuesto desmarcado (`VATLiable='N'`) | `1709` | *"SP: Marcar check Sujeto Impuesto"* |

> Nota: la validación de "Código de barra M duplicado" (`OBCD`, error 1706) está **comentada**. La validación 6 usa `SELECT COUNT(...) HAVING COUNT > '1'` dentro de `EXISTS`, lo que en la práctica siempre evalúa la existencia de la fila agregada (revisar lógica si se requiere precisión).

### 8.2. Validación de PRECIOS según margen

Calcula el **costo de referencia** y compara contra las listas de precio T1/T2/T3 (`ITM1.PriceList = 1,2,3`):

1. **Último costo**: toma `POR1.Price` de la última Orden de Compra (`OPOR` por `DocDate desc`); si no hay OC, usa `OITM.LastPurPrc`.
2. **Margen**: lee `U_Margen_M`/`U_Margen` de la tabla de usuario `[@SUBFAMILIA]` según la subfamilia del artículo. Ese margen **sobrescribe** el del producto.
3. **Precio mínimo** = `costo * (1 + margen/100)` (variables `@AR_M1/M2/M3`). *(Los descuentos de lista D2=8% y D3=4% están hardcodeados pero su aplicación está comentada.)*

Validaciones de bloqueo:

| Lista | Condición | Error | Mensaje |
|---|---|---|---|
| T1 | `Precio_T1 < Mínimo_T1` | `1` | *"Error: Precio T1 ingresado bajo el mínimo permitido"* |
| T2 | `Precio_T2 < Mínimo_T2` | `1` | *"Error: Precio T2 ingresado bajo el mínimo permitido"* |
| T3 | `Precio_T3 < Mínimo_T3` | `1` | *"Error: Precio T3 ingresado bajo el mínimo permitido"* |

### 8.3. Registro de variación de precios (efecto secundario)

Cuando el precio **sí** cumple el mínimo pero **cambió** respecto al histórico (`AIT1` por `loginstanc desc`):
- **Lista T1** → upsert en tabla de usuario `[dbo].[@CAMBIO]`.
- **Lista T3** → upsert en tabla de usuario `[dbo].[@CAMBIOT3]`.
- Guarda: código, nombre, usuario que grabó (`OUSR.U_Name`), fecha, precio nuevo con IVA (`*1.19`), precio antiguo con IVA, y lista. Decide `UPDATE` vs `INSERT` según exista ya el registro.

> La sección "Validar Desarrollos" (object_type 7, comparación T1 < mínimo) está **comentada**.

---

## 9. Bloque FACTURA DE PROVEEDOR — Folios duplicados (`@object_type = '18'`, `A`/`U`)

Controla folios en `OPCH`:

| # | Condición | Error | Mensaje |
|---|---|---|---|
| 1 | Folio duplicado: >1 OPCH con mismo `CardCode + FolioNum + Indicator` (e `Indicator <> 'NT'`) | `1801` | *"TNS:Folio duplicado"* |
| 2 | Folio obligatorio: `FolioNum='0'` e `Indicator <> 'DN'` | `1802` | *"TNS:Folio obligatorio"* |
| 3 | Indicador obligatorio: `Indicator` vacío | `1803` | *"TNS: Indicador obligatorio, pestaña finanzas"* |

> Comentadas: validación de "factura con artículos dañados (WhsCode=12) debe estar bloqueada" (error 1803) y validación de "documento base OC obligatoria" (error 1804).

---

## 10. Bloque PAGO EFECTUADO (`@object_type = '46'`) — **DESHABILITADO**

Todo el bloque está **comentado**. Originalmente impedía pagar (`OVPM`) una factura de proveedor con bloqueo de pago (`OPCH.PayBlock='Y'`): *"TNS: No se puede realizar el pago de factura bloqueada."* (error 1803).

---

## 11. Bloque DESARROLLO BORRADO (`@object_type = '7'`, `U`/`D`)

**Bloque de depuración/diagnóstico** (no es validación). Para actualizaciones o borrados de objeto `7`, arma un mensaje con los parámetros recibidos (`Objt`, `Type`, `NumCols`, `Cols`, `ValCols`) y hace `SELECT @error, @error_message`. `@error` sigue en `0`, por lo que **no bloquea**; sirve para inspeccionar qué envía SAP.

---

## 12. Bloque PAGO RECIBIDO — Apertura de caja y cheques (`@object_type = '24'`, `A`)

Dos controles sobre cobranzas (`ORCT`):

### 12.1. Apertura de caja obligatoria
- Si el usuario que registra el pago (`ORCT.UserSign`) **no** está en la lista de exentos (`'1','70','65','47','95','118','103','93','100','159','68','170'` → manager, rpro, alertsvc, etc.)…
- …debe existir una caja **abierta** para él en la tabla de usuario `[@VYV_REGISTRO_CAJA]` (`U_Cerrada='N'`).
- Si no hay caja abierta → `1701` → *"Caja SAP: Debe realizar apertura de caja"*.

### 12.2. Validación de fecha de cheque (solo pagos registrados en SAP, `DataSource='I'`)
- Aplica si el pago tiene monto en cheque (`CheckSum > 0`).
- Calcula:
  - `@FechaVctoF` = fecha de vencimiento más antigua de la(s) factura(s) aplicada(s) (`OINV.DocDueDate` vía `RCT2.InvType=13`).
  - `@FechaCh` = fecha del cheque (`RCT1.DueDate`).
  - `@DifDiasCh` = `DATEDIFF(day, @FechaVctoF, @FechaCh)`.
- Si `@DifDiasCh > 10` **y** la fecha de hoy es anterior a la del cheque → `1702` → *"Fecha de Cheque sobrepasa los dias permitidos"*.
- En palabras: un cheque a fecha **no puede vencer más de 10 días después** del vencimiento de la factura que paga.

---

## 13. Resumen — Tabla maestra de validaciones de bloqueo

| Objeto | Trans. | Código error | Mensaje |
|---|---|---|---|
| 2 SN | A/U | -1 | RUT Invalido para socio de negocios. |
| 2 SN (C) | A/U | -1 | Debe ingresar direccion / ciudad / comuna de Factura |
| 2 SN (C) | A/U | -1 | Debe usar direccion / ciudad / comuna de Despacho |
| 2 SN (C/S) | A/U | -1 | Debe ingresar Giro |
| 13 Boleta IB | A/U | -1 | El indicador debe ser 39 Boleta Electronica |
| 13 Nota Déb. DN/81 | A/U | -1 | El indicador debe ser 56 Nota Debito Electronica |
| 15 Guía 83 | A/U | -1 | El indicador debe ser 52 Guia Despacho Electronica |
| 13 Fact. Exenta IE | A/U | -1 | El indicador debe ser 34 Factura Exenta Electronica / IVA_EXE |
| 14 Nota Créd. 123 | A/U | -1 | El indicador debe ser 61 / Falta Cód/Doc/Folio/Fecha Referencia |
| 13/14/15 | A/U | -1 | Falta giro / razon social de socio de negocios |
| 20 Compra | A/U | -1 | Registre fecha de vcto / Debe registrar Folio |
| 20 Compra | A/U | 1803 | Indicador obligatorio, pestaña finanzas |
| 20 Compra | A/U | 1801 | Folio duplicado |
| 4 Artículo | A/U | 1708 | Articulo de grupo Arriendo no debe ser inventariable |
| 4 Artículo | A/U | 1701-1705 | Familia/Subfamilia/SKU/Cód. barra inválidos |
| 4 Artículo | A/U | 1707 | Falta registrar Centro Costo |
| 4 Artículo | A/U | 1709 | Marcar check Sujeto Impuesto |
| 4 Artículo | A/U | 1 | Precio T1/T2/T3 bajo el mínimo permitido |
| 18 Fact. Prov. | A/U | 1801-1803 | Folio duplicado / obligatorio / Indicador obligatorio |
| 24 Pago | A | 1701 | Caja SAP: Debe realizar apertura de caja |
| 24 Pago | A | 1702 | Fecha de Cheque sobrepasa los dias permitidos |

---

## 14. Notas técnicas y observaciones

1. **Orden de ejecución:** los bloques se evalúan secuencialmente; el primer `goto MensajeError` aborta. Los bloques de Outbox/Stock (22, 24, 59-67) **no** bloquean: registran eventos.
2. **Pre-commit:** el SP corre antes del commit de SAP. Por eso las integraciones (Outbox/Z_MovStockOMS) se diseñan como *idempotentes* y con `TRY/CATCH`, delegando la validación final a workers post-commit.
3. **Dependencias externas:** función `dbo.BES_Validar_RUT`; tabla `Integration.IntegrationOutbox`; tablas de usuario `[@SUBFAMILIA]`, `[@CAMBIO]`, `[@CAMBIOT3]`, `[@VYV_REGISTRO_CAJA]`; tabla `dbo.Z_MovStockOMS`.
4. **Código comentado relevante** (NO activo hoy): folios DTE (NNM1), indicador Factura Electrónica 33, validación de direcciones en documentos DTE, código de barra duplicado en OBCD (1706), bloqueo de factura dañada, OC obligatoria, pago de factura bloqueada (objeto 46).
5. **Valores `DataSource`:** `O`=Integrada DI API · `I`=Interfaz/manual SAP. Determina qué validaciones de dirección se aplican.
6. **Puntos de mejora sugeridos:** la validación 6 del artículo (código de barra duplicado con `HAVING COUNT > '1'` comparando string) y la emisión de evento `PurchaseOrder.Cancelled` también en `U` merecen revisión.
