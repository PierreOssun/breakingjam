-- M15: the description is a pitch of at most 200 characters; longer ones written before the
-- limit are cut, else their jam could no longer be saved.
update events set description = left(description, 200) where char_length(description) > 200;
