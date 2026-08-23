---
name: rag-knowledge-doc-writer
description: Guía experta para escribir, editar o auditar documentos destinados a una base de conocimiento RAG (texto que será fragmentado, embebido e indexado con vectores para que un LLM lo recupere y responda con base en él). Úsala siempre que el usuario esté redactando, revisando u "optimizando" contenido para un asistente con recuperación aumentada (RAG), knowledge base, FAQ para IA, documentación fuente de un chatbot, o cuando pregunte por qué su asistente alucina o responde mal a pesar de tener la información "en la base de datos". Aplica a cualquier dominio o proyecto.
---

# Escribir documentos para una base de conocimiento RAG

Un documento de RAG no se lee completo ni en orden: se corta en fragmentos, cada fragmento se convierte en un vector, y el modelo solo ve los fragmentos que resultaron más parecidos a la pregunta — sin el resto del documento alrededor y sin saber qué otros fragmentos existen. Escribir para eso es distinto a escribir un manual o un artículo. Estas son las reglas, en orden de impacto real sobre la calidad de las respuestas.

## 0. Diagnóstico previo (siempre primero)

Antes de tocar el texto, entiende el pipeline real, porque cambia todo lo demás:

- **Unidad de chunking**: ¿por encabezado, por tamaño fijo de tokens/caracteres, o el documento completo es un solo chunk? Si es tamaño fijo, un corte puede caer a mitad de una idea — escribe en párrafos cortos y autocontenidos para que un corte arbitrario dañe lo menos posible.
- **Qué metadata vive fuera del texto embebido** (título, categoría, fecha, tags) y si se reinyecta en el prompt final junto al chunk recuperado. Si no se reinyecta, cualquier dato de identificación del tema debe estar dentro del propio texto — no asumas que "el sistema ya sabe de qué trata esto".
- **Cómo se arma el contexto final para el LLM**: ¿se pega el chunk crudo, o hay un template que antepone algo (título, fuente, fecha)? Escribe pensando en cómo se ve exactamente lo que el modelo va a leer, no en cómo se ve el documento fuente.
- **Límites de tamaño** por documento y, si se conoce, tamaño típico de chunk — para dimensionar cuántas ideas por sección es razonable meter.

Si esta información no está disponible, pregúntala antes de dar recomendaciones de formato — no hay un "formato correcto" universal, depende de esto.

## 1. Autonomía del fragmento (el principio más importante)

Cada sección debe poder leerse sola y significar lo mismo que si se leyera con todo el documento alrededor, porque probablemente eso es exactamente lo que va a pasar.

- **Nombra la entidad, no la reemplaces por pronombre**, especialmente al inicio de cada sección o párrafo. "El límite mensual de créditos..." es mejor que "Este límite..." si hay riesgo de que el fragmento anterior (donde se definía "este") no se recupere junto con este.
- Evita "como se explicó antes", "según la sección anterior", "igual que arriba" — para el chunk aislado, "arriba" no existe.
- Empieza cada sección con una frase que reestablezca el tema, aunque se sienta repetitivo al leer el documento completo de corrido. Esa repetición es la que hace que el fragmento sobreviva solo.
- Un fragmento con una sola idea completa recupera mejor que un fragmento con media idea de dos temas distintos — no fuerces dos conceptos no relacionados en la misma sección solo por ahorrar espacio.

## 2. Una afirmación por oración, un hecho por bullet

Los LLM extraen y citan mejor cuando cada unidad de texto contiene exactamente un hecho verificable:

- Prefiere oraciones cortas y declarativas sobre oraciones largas con múltiples cláusulas subordinadas y condiciones anidadas.
- Si una regla tiene excepciones, sepáralas en bullets explícitos ("Aplica excepto cuando X", "Si Y, entonces Z") en vez de enterrarlas en una oración compuesta — las excepciones enterradas en prosa son la fuente número uno de respuestas incorrectas por omisión.
- Datos numéricos, límites, precios, fechas, estados: siempre en tabla o lista estructurada, nunca solo mencionados de pasada en un párrafo. Una tabla es más fácil de citar sin error que un número perdido en medio de una frase.

## 3. Terminología: un concepto, un nombre, siempre

- Define el término canónico para cada concepto y úsalo idéntico en todo el corpus (mismo caso, mismas mayúsculas, mismo singular/plural). Alternar sinónimos ("usuario" / "cliente" / "miembro" para lo mismo) fragmenta la señal semántica entre documentos y puede hacer que el modelo trate la misma cosa como si fueran dos.
- La primera vez que aparece una sigla o un término técnico dentro de una sección, defínelo brevemente — no asumas que el fragmento anterior donde se definió va a estar disponible.
- Si el mismo concepto tiene nombres distintos en distintas partes de la organización (nombre interno vs. nombre de cara al usuario), documenta explícitamente la equivalencia una vez, en vez de dejar que cada documento use el suyo.

## 4. Anti-alucinación: cómo el texto empuja al modelo a inventar (y cómo evitarlo)

- **No prometas contenido que no existe en otro documento verificado.** "Ver X para el detalle" solo es seguro si X realmente tiene ese detalle — si no, el modelo intenta cumplir la promesa del texto inventando el dato faltante.
- **Nunca uses cifras de ejemplo con apariencia de dato real.** Un modelo no distingue "$99 (ejemplo ilustrativo)" leído fuera de contexto de un precio real, si el "(ejemplo ilustrativo)" cae en un fragmento distinto. Si un valor real no está definido, dilo explícitamente como pendiente ("este valor se confirma con [fuente]") en vez de poner cualquier número.
- **Separa reglas de comportamiento del asistente de hechos del dominio.** Instrucciones de tono, idioma, longitud de respuesta o qué hacer si falta información deben vivir en el system prompt, que está presente en el 100% de las conversaciones — un documento del RAG solo se recupera si la pregunta se le parece, así que no es un lugar confiable para reglas que siempre deben aplicar.
- **Evita afirmaciones que envejecen mal.** Fechas concretas, "próximamente", cifras que cambian seguido: redacta de forma que siga siendo cierto después ("en desarrollo, sin fecha confirmada" en vez de una fecha estimada; o incluye una fecha de última actualización si el sistema la puede mostrar).
- **No dejes referencias cruzadas con formato de link o cita que el usuario no pueda seguir.** Si el sistema no tiene navegación real entre documentos, una lista tipo "Ver también: 'Título del doc'" puede terminar citada tal cual en una respuesta y sonar rota. Disuélvela en una frase natural: "esto se explica con más detalle en la sección de [tema]".
- **No repitas contenido de marketing o relleno editorial** ("líder del mercado", "la solución más completa") — no es un hecho verificable, no ayuda a responder nada, y ocupa espacio de contexto que sí podría llevar un dato útil.

## 5. Consistencia de corpus (revisar contra todo lo demás, no solo el documento nuevo)

- [ ] Todo dato que se repite en más de un documento coincide exactamente en todos los lugares donde aparece — si hay dos cifras distintas para lo mismo, el modelo puede recuperar cualquiera de las dos y contradice a las demás respuestas.
- [ ] Un mismo hecho tiene una única fuente de verdad. Si dos documentos explican lo mismo con matices distintos, elimina la duplicación o dejá claro cuál es la fuente autoritativa.
- [ ] No hay datos de entorno de desarrollo, credenciales, URLs internas ni información sensible en el texto que se va a embeber — una vez indexado, es tan recuperable como cualquier otro hecho.
- [ ] Los documentos nuevos no contradicen documentos existentes sobre el mismo tema.

## 6. Voz: elígela deliberadamente, no por default

La voz importa más de lo que parece en RAG, porque el modelo tiende a reusar el registro del fragmento recuperado en su respuesta — cuanto más se parezca el documento a como el asistente debe sonar, menos tiene que parafrasear, y menos oportunidad hay de que distorsione un dato al reformular.

- Si el RAG alimenta un asistente conversacional que le habla directo a un usuario final, **la segunda persona ("tú"/"you", según el idioma) suele ser la mejor opción por defecto**: el documento y la respuesta final quedan en el mismo registro, y el modelo puede reusar frases casi literalmente en vez de traducir de tercera persona a segunda persona sobre la marcha.
- Si el RAG alimenta un sistema interno para analistas, agentes de soporte o herramientas que resumen para un tercero, la tercera persona o un registro más neutro/técnico puede ser más apropiado — ahí no hay un "tú" real al que dirigirse.
- Sea cual sea la elección, **mantenla idéntica en todo el corpus** — un cambio de persona gramatical entre documentos (o peor, dentro del mismo documento) es una de las formas más baratas de romper la coherencia de las respuestas.
- Refiérete siempre al asistente mismo en tercera persona dentro del contenido ("el asistente responde...", "el sistema calcula...") — el documento describe al asistente, no es el asistente hablando en primera persona.

## 7. Checklist final antes de publicar un documento

- [ ] ¿Cada sección tiene sentido leída sola, sin el resto del documento alrededor?
- [ ] ¿Cada oración/bullet contiene un solo hecho verificable, sin excepciones enterradas en prosa?
- [ ] ¿Los datos numéricos están en tabla o lista estructurada, no sueltos en un párrafo?
- [ ] ¿Los términos clave son idénticos a como se usan en el resto del corpus?
- [ ] ¿Alguna frase promete un detalle que no está realmente verificado en otro documento?
- [ ] ¿Hay alguna cifra de ejemplo que podría confundirse con un dato real?
- [ ] ¿Las reglas de comportamiento del asistente están separadas de los hechos del dominio?
- [ ] ¿La voz gramatical es consistente con el resto del corpus y con cómo habla el asistente final?
- [ ] ¿El documento respeta el límite de tamaño del sistema de ingesta?
- [ ] ¿La metadata (título, categoría, fecha) está donde el sistema realmente la lee, sin duplicarse como ruido dentro del texto embebido?