# Catalogue CSV format

Use the headers in `sample-meals.csv`. `mealName`, `cuisine`, `category`, `dietaryPreference`, `calories`, `protein`, and `servingSize` are required. Use `source` and `externalId` when the source gives stable IDs; otherwise the importer uses normalized name, serving size, and diet as its identity. Distinct meals with the same fallback identity need separate external IDs.

Quote CSV cells containing commas, quotes, or newlines. Inside an `allergens` or `ingredients` cell, separate entries with `|`. An empty allergen list is not verification: imported records stay `unknown` unless a curator explicitly supplies `allergenStatus=verified`, a complete allergen list, and a measured serving size. Values for cuisines, categories, and diets must match the application's supported names exactly. Source nutrition CSVs without reviewed cuisine/category mappings will fail validation instead of being guessed.
