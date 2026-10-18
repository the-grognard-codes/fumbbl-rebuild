

Logging updates
Remove the line in between logging events.
The log does not paginate correctly.  Later and Earlier need to be removed entirely.


Real Example output:

	Namen declares a foul.

	foul · Lance

	injury · Lance: armor 4 + 4 = 8 vs base AV 9+ · broken · armor modifiers [4 Offensive Assists] · injury 6 + 3 = 9 · 5

	injury · Lance: armor 4 + 4 = 8 vs base AV 9+ · broken · armor modifiers [4 Offensive Assists] · injury 6 + 3 = 9 · 5

	referee: fouling player sent off

	Namen: Argue the call for Namen.

	argue the call · Namen: 6 vs 6+ · success · stays on pitch

Templated output:

	<Player_Name> declares a foul action.

	Foul · <Target Player> - armor <die1> + <die2> (+-N <Offensive/Defensive> Assists) = <total> vs base AV <Target_AV>+ · armor <broken/held>!

	Injury · <Target_Player> - injury roll <die1> + <die2> (+modifier for dirty player or other skill) = <total> · <stunned/knocked out/casualty>!

	Referee <has spotted/did not spot> the foul!

	<Coach>: Argue the call for <Player_Name>.

	Argue the call <roll> vs <target needed>+ · <success/failure> · <Player_Name> <stays on pitch/is sent off>!

Revised output:

	Namen declares a foul action.

	Foul · Lance - armor 4 + 4 (+4 Offensive Assists) = 12 vs base AV 9+ · armor broken!

	Injury · Lance - injury roll 6 + 3 = 9 · knocked out!

	Referee has spotted the foul!

	Coach Bugman: Argue the call for Namen.

	Argue the call 6 vs 6+ · success · Namen stays on pitch!



Real Example output:

	Match started

	fan factor · Orcs 4 Hire: dedicated fans 2 · dedicated fans result 3 · dedicated fans roll 1

	fan factor · Bugman's Best: dedicated fans 0 · dedicated fans result 2 · dedicated fans roll 2

	weather: weather Nice Weather · weather roll [5, 2]

	free petty cash · Bugman's Best: gold 600000

	Orcs 4 Hire conceded. Bugman's Best wins 0–2

	player event · Phil: message is awarded a touchdown

	player event · Jeff: message is awarded a touchdown

	most valuable players: player ids away [Match, Match] · player ids home []

	winnings: winnings away 80000 · winnings home 0

	dedicated fans · Orcs 4 Hire: conceded true · dedicated fans modifier away 1 · dedicated fans modifier home -1 · roll away 3 · roll home 1


Templated output:

	<home_team_name> (Home): Fan factor · dedicated fans 2 + roll <roll> · Fan factor is <total>

	<away_team_name> (Away): Fan factor · dedicated fans 0 + roll <roll> · Fan factor is <total>

	Weather: Nice Weather · [<die1> + <die2> = <total>]

	Petty cash · <team with lower team value receiving petty cash>: <petty_cash_gold>gp

	<conceding team name> conceded!  <winning team> wins <final_score>

	Player event · <player1> is awarded a touchdown due to concession

	Player event · <player2> is awarded a touchdown due to concession

	<home_team_name> · <player> is awarded MVP for the match.

	<away_team_name> · <player> is awarded MVP for the match.

	Winnings: Home team <home_winnings>gp · Away team <away_winnings>gp

	<home_team_name> dedicated fans · team conceded, loses <number> dedicated fans.  Dedicated fans now <new dedicated fans value>
	<away_team_name> dedicated fans · rolls <roll>.  Dedicated fans now <number> (<"no change" if value did not change>)


Revised output:

	Orcs 4 Hire (Home): Fan factor · dedicated fans 2 + roll 1 · Fan factor is 3

	Bugman's Best (Away): Fan factor · dedicated fans 0 + roll 2 · Fan factor is 2

	Weather: Nice Weather · [5 + 2 = 7]

	Petty cash · Bugman's Best: 600000gp

	Orcs 4 Hire conceded!  Bugman's Best wins 0-2

	Player event · Phil is awarded a touchdown due to concession

	Player event · Jeff is awarded a touchdown due to concession

	Orcs 4 Hire · receives no MVP award due to concession

	Bugman's Best · Unknown is awarded MVP for the match.

	Winnings: Home team 0gp · Away team 80000gp

	Orcs 4 Hire dedicated fans · team conceded, loses 1 dedicated fans.  Dedicated fans now 1
	<away_team_name> dedicated fans · rolls <roll>.  Dedicated fans now <number> (<"no change" if value did not change>)

Real Example output:

	Lineman 2 blocks Cline.

	Lineman 2 block dice against Cline: Pow.

	Skill Testers 3000 chooses die 1 (Pow): Lineman 2 against Cline · dice Pow.

	Lineman 2: Push to 16, 13.

	Cline is pushed to (16, 13).

	Lineman 2: Follow up.

	Lineman 2 follows up to (15, 13).

	Cline is knocked down.

	injury · Cline: armor 4 + 6 = 10 vs base AV 10+ · broken · injury 4 + 6 = 10 · 6 · casualty 4 · serious injury die 4

	injury · Cline: armor 4 + 6 = 10 vs base AV 10+ · broken · injury 4 + 6 = 10 · 6 · casualty 4 · serious injury die 4

	Bugman's Best: Decline apothecary.

	apothecary roll · Cline:

	Cline is removed from play.


Templated output:

	<acting_player> blocks <target_player>.

	Block dice · <dice result icons, the die selected is highlighted / circled blue if the acting player chose the result, red if the target_player coach chose>

	<target_player and/or acting_player> <is/are> <result of block die, pushed back, knocked down, placed prone, remains standing>

	<target player> is pushed to <coordinates>

	<action player> <chooses to follow up / does not follow up>

	Armor · <Target_player> - armor <die1> + <die2> <(+1 mighty blow) = <total> vs base AV <Target_AV>+ · armor <broken/held>!

	Injury · <Target_Player> - injury roll <die1> + <die2> (+modifier for mighty blow carried over) = <total> · <stunned/knocked out/casualty>!

	Casualty · <Target_Player> - casualty roll <d16> <(+N niggling injury/decay modifiers if any)> = <badly hurt/serious injury/head injury/dead/etc>

	<coach of injured player>: <Uses/Declines> apothecary

	Casualty · <Target_Player> - casualty roll <d16> <(+N niggling injury/decay modifiers if any)> = <badly hurt/serious injury/head injury/dead/etc>

	<target player> · is <stunned/knocked out/removed from play as a casualty>

Revised output:

	Lineman 2 blocks Cline.

	Block dice · POW/PUSH [pow gets highlighted the color of the active coach, blue or yellow]

	Cline is knocked down.

	Cline is pushed to <coordinates>.

	Lineman 2 chooses to follow up.

	Armor · Cline - armor roll 4 + 6 = 10 vs base AV 10+ · armor broken!

	Injury · Cline - injury roll 4 + 6 = 10 · casualty!

	Casualty · Cline - casualty roll 8 = serious injury!

	Bugman's Best: Declines apothecary

	Cline · is removed from play as a casualty.