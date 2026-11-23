# Montar una página con `@defer` en una prueba

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Si la plantilla tiene un `@defer`, el compilador le emite metadata **asíncrona** y
`TestBed.createComponent()` falla así:

```
Component '_VentasPage' has unresolved metadata.
Please call `await TestBed.compileComponents()` before running this test.
```

El mensaje engaña: llamar a `compileComponents()` no lo arregla. Esa función solo
resuelve la metadata de los tipos que el TestBed **conoce**, y una página
standalone que solo se importa en el fichero de prueba no está entre ellos. Hay
que declararla:

```ts
TestBed.configureTestingModule({
  imports: [VentasPage],   // ← sin esto, "unresolved metadata" aunque compiles
  providers: [ /* … */ ],
});
await TestBed.compileComponents();
fixture = TestBed.createComponent(VentasPage);
```

Costó un rato porque el síntoma parece un problema de bundling —el chunk de la
prueba sale minúsculo— y porque páginas sin `@defer` montan sin nada de esto.
Antes de dar por imposible montar una página, mira si su plantilla difiere por un
`@defer`.

Y usa `npm test`, no `npx vitest`: sin pasar por el runner de Angular, el
`templateUrl` no se inlinea y el fallo es otro distinto con el mismo aspecto.
