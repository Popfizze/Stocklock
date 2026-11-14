# Shared Bedrock guardrail. The code applies it (ApplyGuardrail) only when GUARDRAIL_ID is set.

resource "aws_bedrock_guardrail" "stocklock" {
  name        = "${local.name}-guardrail"
  description = "StockLock: no personalised advice, no guaranteed returns, no real trades"

  blocked_input_messaging   = "Désolé, StockLock ne peut pas répondre à cette demande : il ne donne pas de conseil financier personnalisé, ne promet aucun rendement et ne passe aucun ordre réel. Les analyses restent éducatives et en simulation."
  blocked_outputs_messaging = "Cette réponse a été bloquée par les garde-fous de StockLock (conseil personnalisé, rendement garanti ou transaction réelle). Les analyses restent éducatives et en simulation."

  topic_policy_config {
    topics_config {
      name       = "Personalized financial advice"
      type       = "DENY"
      definition = "Recommandation ferme et personnalisée, présentée comme un conseil professionnel, de placer l'argent d'une personne réelle dans un titre ou un produit financier précis."
      examples = [
        "Je vous conseille de mettre toutes vos économies dans Tesla.",
        "Vu votre salaire, achetez 200 actions de NVDA cette semaine.",
        "Dans votre situation, vendez votre REER et achetez du bitcoin.",
      ]
    }

    topics_config {
      name       = "Guaranteed returns"
      type       = "DENY"
      definition = "Promesse ou affirmation qu'un placement produira un rendement certain, garanti ou sans aucun risque de perte."
      examples = [
        "Ce titre va doubler d'ici un an, c'est garanti.",
        "Vous ne pouvez pas perdre d'argent avec ce placement.",
        "Rendement assuré de 20 % par année.",
      ]
    }

    topics_config {
      name       = "Real trade instructions"
      type       = "DENY"
      definition = "Demande d'exécuter un ordre réel d'achat ou de vente sur un compte de courtage, ou instructions pour passer un tel ordre maintenant."
      examples = [
        "Passe un ordre d'achat de 100 actions AAPL sur mon compte.",
        "Vends toutes mes actions Shopify maintenant.",
        "Donne-moi l'ordre exact à entrer dans mon courtier pour acheter.",
      ]
    }
  }

  content_policy_config {
    filters_config {
      type            = "HATE"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "INSULTS"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "SEXUAL"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "VIOLENCE"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "MISCONDUCT"
      input_strength  = "MEDIUM"
      output_strength = "MEDIUM"
    }
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE"
    }
  }

  contextual_grounding_policy_config {
    filters_config {
      type      = "GROUNDING"
      threshold = 0.7
    }
    filters_config {
      type      = "RELEVANCE"
      threshold = 0.7
    }
  }
}

resource "aws_bedrock_guardrail_version" "stocklock" {
  guardrail_arn = aws_bedrock_guardrail.stocklock.guardrail_arn
  description   = "Managed by Terraform"

  lifecycle {
    replace_triggered_by = [aws_bedrock_guardrail.stocklock]
  }
}
