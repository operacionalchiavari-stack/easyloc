-- Editor de cena do projeto: cada print/renderização salvo num projeto leva junto a cena 3D que a gerou, num .json em
-- <empresa>/<projeto>/cenas/ do bucket "projetos" (mesmas políticas de upload/remoção por pasta de projeto que já valem
-- pras imagens). O bucket só aceitava imagens.
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/json']))
 where id = 'projetos';
