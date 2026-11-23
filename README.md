# lines-on-smooth-cublic-surfaces

![](https://github.com/plumsirawit/lines-on-smooth-cublic-surfaces/blob/fa011de0e36ebbc340092d72771c997bc2005ee9/public/og-image.png)

An attempt of a visualization of straight lines on smooth cubic surfaces.

Enter a cubic polynomial; the page checks that it defines a smooth cubic surface, draws its real
points near the origin, finds all 27 lines numerically, and draws and counts the real ones.
Everything runs in the browser (static hosting, no backend).

## Development

```sh
npm install
npm run dev      # dev server
npm test         # math tests (Node's built-in test runner)
npm run lint
npm run build    # static site in dist/
```

## How it works

- **Input** (`src/math/parse.ts`): a polynomial in `x, y, z` (affine, homogenised with `w`) or a
  homogeneous cubic in `x, y, z, w`, with exact rational coefficients.
- **Smoothness** (`src/math/cubic.ts`): `V(F)` is smooth iff the partials `F_x, F_y, F_z, F_w`
  have no common zero in `P^3(C)`, iff the 80 × 56 Macaulay matrix in degree 5 has full rank.
  The rank is computed modulo random large primes; full rank mod any prime proves smoothness.
- **Lines** (`src/math/lines.ts`): in a random chart of the Grassmannian, lines are spans of
  `(1, 0, a, b)` and `(0, 1, c, d)`, giving 4 cubic equations in 4 unknowns. These are solved by
  total-degree homotopy continuation (81 paths); exactly 27 solutions are expected, and those with
  zero imaginary part are the real lines.
- **Surface** (`src/math/mesh.ts`): marching tetrahedra on a grid, run in a Web Worker and
  rendered with Babylon.js (`src/components/SurfaceViewer.tsx`).
