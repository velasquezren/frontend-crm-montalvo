# 4c. La pestaña Analítica tiene CINCO cubos, no cuatro

> Parte de la skill `crm-finanzas`: lee antes su [índice](../SKILL.md).

`comisionTotalUsd = comisionA + comisionTipoARA + comisionB + comisionC + bonos`.

El bloque «Comisión por tipo» mostraba cuatro tarjetas —A, B, C y Bonos— debajo
de un KPI con el total. Faltaba **Tipo A (RA)**, así que las tarjetas sumaban
menos que el número de arriba y nada lo decía. El backend lo devolvía desde que
se implementó el cubo (22/8/2026); lo que no lo declaraba era
`ResumenAnalitica` en `analitica.model.ts`, y un campo que no está en la
interfaz llega en el JSON y se cae en silencio.

Es el patrón de siempre con este cubo: se añadió al motor, al Excel («Tipo A
(RA)») y al Word, y la pestaña se quedó atrás. **Si tocas los conceptos de
comisión, la lista de sitios que los enumeran son cinco, no uno.**

De paso: `analitica.model.ts` escribía a mano
`estado: 'BORRADOR' | 'CALCULADO' | 'CERRADO'` cuando el ciclo de vida tiene
cinco estados desde §8. Ahora usa `EstadoPeriodo` de `core/api/db-enums`, que se
genera del `schema.prisma`. **Ninguna unión de estados se escribe a mano**: para
eso existe `npm run sync:tipos`.
