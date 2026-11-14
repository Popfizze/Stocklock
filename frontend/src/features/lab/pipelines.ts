/** The score pipeline's place in the Labo: the one pipeline that is not a lab catalog step. */

export const SCORE_PIPELINE_ID = 'scores'

export const SCORE_PIPELINE = {
  title: 'Table des scores',
  description:
    'Reconstruit sur AWS la table des scores lue par le tableau de bord et les fiches titre : données brutes (Bronze), nettoyées (Silver), puis score par titre (Gold). Un run dure 4 à 5 minutes.',
}
