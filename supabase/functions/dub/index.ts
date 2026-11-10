// Point d'entrée de la fonction « dub » : toute la logique est dans lib.ts.
import { handle } from "./lib.ts";

Deno.serve(handle);
