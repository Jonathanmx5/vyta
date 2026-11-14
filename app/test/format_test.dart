import 'package:coach/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('décimales à la française', () {
    expect(formatDecimal(79.5), '79,5');
    expect(formatDecimal(80), '80,0');
    expect(formatDecimal(18.349, decimales: 2), '18,35');
  });

  test('millilitres en litres', () {
    expect(formatLitres(1500), '1,50');
    expect(formatLitres(250), '0,25');
    expect(formatLitres(0), '0,00');
  });

  test('tronquer : coupe avec « … » sans casser un émoji', () {
    expect(tronquer('Riz', 5), 'Riz');
    expect(tronquer('abcdef', 5), 'abcd…');
    expect(tronquer('abcdef', 5).length, 5);
    // L'émoji (2 unités UTF-16) occupe les positions 3 et 4 : il est retiré
    // en entier plutôt que coupé en deux.
    final coupe = tronquer('abc🍕defg', 5);
    expect(coupe, 'abc…');
    expect(coupe.length, lessThanOrEqualTo(5));
  });

  group('joursEntre', () {
    test('compte les jours calendaires, dans les deux sens', () {
      expect(joursEntre(DateTime(2026, 1, 1), DateTime(2026, 1, 1)), 0);
      expect(joursEntre(DateTime(2026, 1, 1), DateTime(2026, 1, 8)), 7);
      expect(joursEntre(DateTime(2026, 1, 8), DateTime(2026, 1, 1)), -7);
      expect(joursEntre(DateTime(2024), DateTime(2025)), 366);
    });

    test("l'heure de la journée ne compte pas", () {
      expect(
        joursEntre(DateTime(2026, 1, 1, 23, 59), DateTime(2026, 1, 2, 0, 1)),
        1,
      );
      expect(
        joursEntre(DateTime(2026, 1, 1, 0, 1), DateTime(2026, 1, 1, 23)),
        0,
      );
    });

    test("le passage à l'heure d'été ne fait pas perdre un jour", () {
      // Le 29 mars 2026, la France avance d'une heure : de minuit à minuit,
      // 23 heures seulement. `difference().inDays` rendrait 6 et 818.
      expect(joursEntre(DateTime(2026, 3, 23), DateTime(2026, 3, 30)), 7);
      expect(joursEntre(DateTime(2024), DateTime(2026, 3, 30)), 819);
      // Et le passage à l'heure d'hiver (25 octobre 2026) n'en ajoute pas.
      expect(joursEntre(DateTime(2026, 10, 19), DateTime(2026, 10, 26)), 7);
    });
  });
}
