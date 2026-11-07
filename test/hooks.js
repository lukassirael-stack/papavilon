// Přesměruje import '@supabase/supabase-js' na mock (jen pro test).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./loader.js', pathToFileURL(import.meta.filename));
