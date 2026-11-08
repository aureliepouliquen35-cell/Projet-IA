# Cahier des charges : challenge Nova Services

> Document source fourni par Aurel le 2026-11-08. Texte d'origine conservé tel quel, sans modification.
> Il sert de référence au PRD : `_bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-08/prd.md`.

## Contexte du projet
Vous rejoignez Nova Services, une entreprise spécialisée dans l'accompagnement et les services numériques auprès de professionnels.

L'entreprise reçoit chaque semaine de nombreuses demandes provenant de ses clients et prospects : demandes d'informations, problèmes techniques, demandes de rendez-vous, questions administratives ou sollicitations nécessitant l'intervention d'un collaborateur.

Aujourd'hui, ces demandes arrivent principalement par email ou téléphone. Elles sont ensuite retranscrites manuellement dans différents fichiers, ce qui entraîne des oublis, des doublons et un manque de visibilité sur leur traitement.

La direction souhaite disposer d'une application simple permettant de centraliser les demandes et de suivre leur traitement.

## Mission
Concevoir, développer et mettre en production cette application en utilisant une approche de développement assistée par l'IA.

Besoins exprimés par la direction :
- Les clients doivent disposer d'un moyen simple pour transmettre une demande et savoir qu'elle a bien été enregistrée.
- Les collaborateurs doivent pouvoir retrouver l'ensemble des demandes, consulter leur contenu, identifier celles qui nécessitent une intervention et suivre leur évolution.

Avant de commencer le développement : analyser le besoin, identifier les utilisateurs concernés, définir les principales fonctionnalités et organiser le projet.

## L'application à développer
Une application web de gestion des demandes clients, avec les fonctionnalités suivantes :
- permettre à un client ou prospect de déposer une demande ;
- renseigner son nom, ses coordonnées, l'objet, la catégorie et la description de sa demande ;
- enregistrer les demandes dans une base de données ;
- afficher une confirmation après l'envoi d'une demande ;
- permettre aux collaborateurs de se connecter à un espace sécurisé ;
- afficher la liste des demandes reçues ;
- consulter le détail d'une demande ;
- rechercher ou filtrer les demandes ;
- modifier le statut d'une demande ;
- gérer au minimum les statuts Nouvelle, En cours et Traitée ;
- conserver un historique simple du traitement d'une demande ;
- permettre la gestion des comptes utilisateurs ;
- différencier les droits d'un collaborateur et d'un administrateur ;
- permettre à un administrateur de gérer les principaux paramètres nécessaires au fonctionnement de l'application.

D'autres fonctionnalités peuvent être ajoutées si elles améliorent l'expérience utilisateur ou facilitent le travail des équipes.

## Développement assisté par l'IA
L'IA peut aider à concevoir la structure, préparer les interfaces, générer du code, créer les fonctionnalités, résoudre des erreurs, améliorer le code et produire une partie de la documentation technique. Les éléments générés doivent être compris, vérifiés et testés avant intégration. Le développeur reste responsable de la solution finale.

## Mise en production
- Préparer un environnement de production rendant l'application accessible en ligne.
- Séparer correctement les paramètres de développement et de production.
- Ne jamais enregistrer identifiants, mots de passe, clés ou informations sensibles dans le code source.
- Versionner le projet pour conserver l'historique et identifier les versions déployées.
- Prévoir une procédure de retour à une version précédente en cas de dysfonctionnement.

## Fonctionnement de l'application
- Mettre en place un dispositif simple pour consulter les erreurs et les événements importants.
- Sauvegarder les données et prévoir une procédure de restauration.
- Prévoir les principales actions en cas d'indisponibilité du service.
- Organiser un support simple distinguant le premier niveau d'assistance des interventions techniques avancées.
- Documenter les mesures concernant les accès, la sécurité et la protection des données personnelles.

## Résultat attendu
Une application web fonctionnelle, sécurisée et déployée, comprenant :
- une interface de dépôt des demandes ;
- un espace interne authentifié ;
- une gestion des utilisateurs et des droits ;
- une gestion des demandes et de leurs statuts ;
- une base de données ;
- une application versionnée et accessible en ligne ;
- un dispositif de logs et de suivi des erreurs ;
- une stratégie de sauvegarde et de restauration ;
- une procédure de retour à une version précédente ;
- une documentation synthétique (déploiement, maintenance, support, sécurité, protection des données).
